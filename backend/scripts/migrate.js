import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database migration runner
 * Usage: node scripts/migrate.js [up|down]
 * Tracks applied migrations in database
 *
 * Hardening notes (see FINAL_ARCHITECTURE.md / early review discussion):
 * - Distributed lock: two deploy processes running this simultaneously
 *   used to both read the same (empty) history and both run the same
 *   migration concurrently — fine for an idempotent migration, actively
 *   dangerous for one that isn't (e.g. renaming a field, incrementing a
 *   counter). See acquireLock/releaseLock below.
 * - Correct up/down state tracking: `down` used to just append another
 *   history row rather than updating applied state, and the old
 *   `applied.includes(name)` check treated presence of the name as
 *   "currently applied" regardless of direction — so a migration that
 *   was reverted could never be re-applied via `up` again, since its
 *   name still literally appeared in history from the old "up" row. See
 *   getAppliedMigrationNames below: it now looks at the *latest* row per
 *   migration, not just row existence.
 * - Checksum drift detection: warns (doesn't block) if a migration file's
 *   content has changed since it was recorded as applied — usually a
 *   sign someone edited an already-shipped migration instead of writing
 *   a new one, which is easy to do by accident and easy to miss in review.
 */

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const LOCK_ID = "migration_runner_lock";
const LOCK_STALE_AFTER_MS = 10 * 60 * 1000; // 10 min — long enough for any real migration, short enough that a crashed runner doesn't block deploys indefinitely

async function connectDB() {
  // Every other file in this project reads MONGODB_URI (validateEnv.js
  // requires it at boot, db/mongoose.js defaults to it) — this used to read
  // a different name, MONGO_URI, which isn't set anywhere. In a real
  // deployment that would silently fall back to a local, almost certainly
  // wrong or nonexistent database instead of erroring, which is a
  // dangerous failure mode specifically for a migration tool.
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ai_study_assistant";
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB");
}

function fileChecksum(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/**
 * Atomically claims the migration lock, including recovering from a
 * stale lock left behind by a crashed/killed runner. The filter+update in
 * findOneAndUpdate is a single atomic operation — two concurrent callers
 * racing this can't both succeed for the same document. One further race
 * exists only when the lock document doesn't exist yet at all (both
 * callers upserting a brand-new doc simultaneously); MongoDB itself
 * resolves that by rejecting the loser with a duplicate-key error, which
 * is caught below and treated as "someone else got it first."
 */
async function acquireLock(db) {
  const owner = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`;
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - LOCK_STALE_AFTER_MS);

  try {
    const result = await db.collection("migrations_lock").findOneAndUpdate(
      {
        _id: LOCK_ID,
        $or: [{ locked: { $ne: true } }, { lockedAt: { $lt: staleThreshold } }],
      },
      { $set: { locked: true, lockedAt: now, owner } },
      { upsert: true, returnDocument: "after" }
    );
    // Driver version differences: some return the doc directly, some wrap
    // it in { value }. Normalize so the check below works either way.
    const doc = result?.value !== undefined ? result.value : result;
    return doc?.owner === owner ? owner : null;
  } catch (err) {
    if (err.code === 11000) return null; // lost the concurrent-upsert race
    throw err;
  }
}

async function releaseLock(db, owner) {
  // Only releases the lock if it's still the one we hold — if it went
  // stale and another runner already reclaimed it, releasing
  // unconditionally would tear down that runner's lock instead of ours.
  await db.collection("migrations_lock").updateOne(
    { _id: LOCK_ID, owner },
    { $set: { locked: false }, $unset: { owner: "" } }
  );
}

/**
 * Pure reduction: given migration history rows (each {name, direction,
 * ...}), returns the set of migration names whose *most recent* row is
 * "up". Exported separately from getAppliedMigrationNames's DB read so
 * this logic — the actual bug fix — is unit-testable without a real
 * MongoDB connection.
 */
export function computeAppliedNames(rows) {
  const latestDirectionByName = new Map();
  for (const row of rows) latestDirectionByName.set(row.name, row.direction);
  return new Set([...latestDirectionByName].filter(([, dir]) => dir === "up").map(([name]) => name));
}

/**
 * A migration's current applied state is whatever its most recent
 * history row says — not just whether its name appears anywhere in the
 * (append-only, full-audit-trail) history collection. Without sorting by
 * appliedAt and taking the last direction per name, a reverted migration
 * would show as "applied" forever afterward (its old "up" row never
 * disappears, `down` just appends a second row alongside it), making it
 * impossible to re-apply.
 */
async function getAppliedMigrationNames(db) {
  const rows = await db.collection("migrations_history").find({}).sort({ appliedAt: 1 }).toArray();
  return computeAppliedNames(rows);
}

/**
 * Warns (doesn't block) about any migration whose file content no longer
 * matches the checksum recorded when it was applied — usually means
 * someone edited an already-shipped migration file rather than writing a
 * new one. Only checked against the latest row per name, same reasoning
 * as getAppliedMigrationNames.
 */
async function warnOnChecksumDrift(db, files) {
  const rows = await db.collection("migrations_history").find({}).sort({ appliedAt: 1 }).toArray();
  const latestRowByName = new Map();
  for (const row of rows) latestRowByName.set(row.name, row);

  for (const file of files) {
    const name = file.replace(".js", "");
    const row = latestRowByName.get(name);
    if (!row?.checksum) continue; // never applied, or applied before checksums existed
    const currentChecksum = fileChecksum(path.join(MIGRATIONS_DIR, file));
    if (currentChecksum !== row.checksum) {
      console.warn(`\n⚠ ${name} has changed since it was applied (recorded ${row.direction} at ${row.appliedAt.toISOString()}).`);
      console.warn(`  If this was an intentional edit to already-shipped behavior, write a new migration instead of editing this one.\n`);
    }
  }
}

async function recordMigration(db, name, direction, checksum) {
  await db.collection("migrations_history").insertOne({
    name, direction, checksum, appliedAt: new Date(),
  });
}

async function runMigrations(direction = "up") {
  await connectDB();
  const db = mongoose.connection.db;

  const owner = await acquireLock(db);
  if (!owner) {
    console.error("✗ Could not acquire migration lock — another migration run is already in progress (or its lock hasn't gone stale yet).");
    console.error("  If you're certain no other run is active, wait up to 10 minutes for the stale lock to clear, or clear migrations_lock manually.");
    await mongoose.connection.close();
    process.exit(1);
  }

  try {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".js"))
      .sort();

    await warnOnChecksumDrift(db, files);
    const applied = await getAppliedMigrationNames(db);

    // Rolling back needs to undo in reverse order (last-applied-first) — a
    // later migration can depend on something an earlier one created, so
    // reverting 001 before 005 in ascending order could try to tear down
    // something a still-pending-revert migration still relies on.
    const orderedFiles = direction === "down" ? [...files].reverse() : files;

    console.log(`\n📦 Running migrations: ${direction}`);
    for (const file of orderedFiles) {
      const migration = await import(path.join(MIGRATIONS_DIR, file));
      const name = file.replace(".js", "");
      const checksum = fileChecksum(path.join(MIGRATIONS_DIR, file));

      if (direction === "up" && !applied.has(name)) {
        console.log(`\n→ ${name}`);
        await migration.default.up();
        await recordMigration(db, name, "up", checksum);
        console.log(`✓ ${name} applied`);
      } else if (direction === "down" && applied.has(name)) {
        console.log(`\n← ${name}`);
        await migration.default.down();
        await recordMigration(db, name, "down", checksum);
        console.log(`✓ ${name} reverted`);
      }
    }

    console.log("\n✓ Migrations complete\n");
  } finally {
    await releaseLock(db, owner);
    await mongoose.connection.close();
  }
}

// Guarded so this file can be imported (e.g. to unit-test
// computeAppliedNames) without side-effecting a real migration run —
// only actually executes when invoked directly as `node migrate.js`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const direction = process.argv[2] || "up";
  if (!["up", "down"].includes(direction)) {
    console.error("Usage: node migrate.js [up|down]");
    process.exit(1);
  }

  runMigrations(direction).catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
