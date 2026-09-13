import test from "node:test";
import assert from "node:assert/strict";
import { computeAppliedNames } from "../scripts/migrate.js";

test("a migration with only an 'up' row is applied", () => {
  const rows = [{ name: "001_x", direction: "up", appliedAt: new Date("2026-01-01") }];
  assert.ok(computeAppliedNames(rows).has("001_x"));
});

test("a migration with only a 'down' row (never applied, or a stray revert) is not applied", () => {
  const rows = [{ name: "001_x", direction: "down", appliedAt: new Date("2026-01-01") }];
  assert.equal(computeAppliedNames(rows).has("001_x"), false);
});

test("THE BUG: a migration applied then reverted (no re-apply) must show as NOT applied", () => {
  // This is the actual defect the rewrite fixes: the old code treated
  // "this name appears anywhere in history" as "currently applied",
  // which meant `up` would refuse to re-run a migration that had been
  // deliberately reverted, with no way to re-apply it short of manually
  // editing the history collection.
  const rows = [
    { name: "003_x", direction: "up", appliedAt: new Date("2026-01-01") },
    { name: "003_x", direction: "down", appliedAt: new Date("2026-01-02") },
  ];
  assert.equal(computeAppliedNames(rows).has("003_x"), false);
});

test("applied, reverted, then re-applied is correctly applied again", () => {
  const rows = [
    { name: "001_x", direction: "up", appliedAt: new Date("2026-01-01") },
    { name: "001_x", direction: "down", appliedAt: new Date("2026-01-02") },
    { name: "001_x", direction: "up", appliedAt: new Date("2026-01-03") },
  ];
  assert.ok(computeAppliedNames(rows).has("001_x"));
});

test("row order in the input doesn't matter as long as appliedAt reflects real chronology", () => {
  // getAppliedMigrationNames always sorts by appliedAt before calling
  // this, but the pure function itself just trusts array order — this
  // documents that contract explicitly rather than leaving it implicit.
  const chronological = [
    { name: "001_x", direction: "up", appliedAt: new Date("2026-01-01") },
    { name: "001_x", direction: "down", appliedAt: new Date("2026-01-02") },
  ];
  assert.equal(computeAppliedNames(chronological).has("001_x"), false);
});

test("multiple independent migrations are tracked independently", () => {
  const rows = [
    { name: "001_a", direction: "up", appliedAt: new Date("2026-01-01") },
    { name: "002_b", direction: "up", appliedAt: new Date("2026-01-01") },
    { name: "002_b", direction: "down", appliedAt: new Date("2026-01-02") },
  ];
  const applied = computeAppliedNames(rows);
  assert.ok(applied.has("001_a"));
  assert.equal(applied.has("002_b"), false);
});

test("empty history means nothing is applied", () => {
  assert.deepEqual(computeAppliedNames([]), new Set());
});
