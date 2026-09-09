import test from "node:test";
import assert from "node:assert/strict";
import { readinessForConcept } from "../../src/services/adaptiveRuntime.js";

const NO_PREREQ_CONCEPT = { prerequisites: [] };

test("retention decays with elapsed time even when a stale state.retention is stored", () => {
  // Same mastery, same stale stored retention (0.95, as if snapshotted at
  // a review long ago) — only lastReviewedAt differs. If retention were
  // read straight from state.retention (the bug), these two would be
  // identical. They should differ, and the older one should be lower.
  const now = Date.now();
  const recentlyReviewed = {
    mastery: 0.9,
    confidence: 0.5,
    retention: 0.95,
    lastReviewedAt: new Date(now - 1 * 864e5), // 1 day ago
  };
  const longAgoReviewed = {
    mastery: 0.9,
    confidence: 0.5,
    retention: 0.95, // identical stale value
    lastReviewedAt: new Date(now - 60 * 864e5), // 60 days ago
  };

  const recentReadiness = readinessForConcept(NO_PREREQ_CONCEPT, recentlyReviewed, null, now);
  const oldReadiness = readinessForConcept(NO_PREREQ_CONCEPT, longAgoReviewed, null, now);

  assert.ok(oldReadiness < recentReadiness, "readiness for a concept reviewed 60 days ago should be lower than one reviewed yesterday, even with the same stored retention");
});

test("readiness for a long-unreviewed concept reflects decayed retention, not the stale stored value", () => {
  const now = Date.now();
  const state = {
    mastery: 0.9,
    confidence: 0.5,
    retention: 0.95, // stale — would dominate the score if read directly (the bug)
    lastReviewedAt: new Date(now - 60 * 864e5),
  };

  const readiness = readinessForConcept(NO_PREREQ_CONCEPT, state, null, now);

  // With the bug: 0.65*0.9 + 0.15*0.5 + 0.1*1 + 0.1*0.95 = 0.855
  // Fixed: retention ~= retentionFraction(0.9, 60) ~= 0.108, giving ~0.771
  assert.ok(readiness < 0.82, `expected decayed readiness well under the buggy 0.855, got ${readiness}`);
  assert.ok(readiness > 0.7, `expected readiness still mastery-dominated (~0.77), got ${readiness}`);
});

test("a never-reviewed concept (no lastReviewedAt) still gets a defined, low readiness", () => {
  const state = { mastery: 0, confidence: 0.5, retention: undefined, lastReviewedAt: null };
  const readiness = readinessForConcept(NO_PREREQ_CONCEPT, state, null);
  assert.equal(typeof readiness, "number");
  assert.ok(readiness >= 0 && readiness <= 1);
});
