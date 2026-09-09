import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Database migration runner
 * Usage: node scripts/migrate.js [up|down]
 * Tracks applied migrations in database
 */

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function connectDB() {
  // Every other file in this project reads MONGODB_URI (validateEnv.js
  // requires it at boot, db/mongoose.js defaults to it) — this used to read
  // a different name, MONGO_URI, which isn't set anywhere. In a real
  // deployment that would silently fall back to a local, almost certainly
  // wrong or nonexistent database instead of erroring, which is a
  // dangerous failure mode specifically for a migration tool.
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/prepnexia";
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB");
}

async function createMigrationsCollection() {
  const db = mongoose.connection.db;
  try {
    await db.collection("migrations").insertOne({
      version: "1.0",
      appliedAt: new Date(),
    });
  } catch (err) {
    // Collection likely already exists
  }
}

async function getMigrationHistory() {
  const db = mongoose.connection.db;
  const history = await db
    .collection("migrations_history")
    .find({})
    .toArray();
  return history.map((h) => h.name);
}

async function recordMigration(name, direction) {
  const db = mongoose.connection.db;
  await db.collection("migrations_history").insertOne({
    name,
    direction,
    appliedAt: new Date(),
  });
}

async function runMigrations(direction = "up") {
  await connectDB();
  await createMigrationsCollection();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();

  const applied = await getMigrationHistory();

  // Rolling back needs to undo in reverse order (last-applied-first) — a
  // later migration can depend on something an earlier one created, so
  // reverting 001 before 005 in ascending order could try to tear down
  // something a still-pending-revert migration still relies on.
  const orderedFiles = direction === "down" ? [...files].reverse() : files;

  console.log(`\n📦 Running migrations: ${direction}`);
  for (const file of orderedFiles) {
    const migration = await import(path.join(MIGRATIONS_DIR, file));
    const name = file.replace(".js", "");

    if (direction === "up" && !applied.includes(name)) {
      console.log(`\n→ ${name}`);
      await migration.default.up();
      await recordMigration(name, "up");
      console.log(`✓ ${name} applied`);
    } else if (direction === "down" && applied.includes(name)) {
      console.log(`\n← ${name}`);
      await migration.default.down();
      await recordMigration(name, "down");
      console.log(`✓ ${name} reverted`);
    }
  }

  console.log("\n✓ Migrations complete\n");
  await mongoose.connection.close();
}

const direction = process.argv[2] || "up";
if (!["up", "down"].includes(direction)) {
  console.error("Usage: node migrate.js [up|down]");
  process.exit(1);
}

runMigrations(direction).catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
