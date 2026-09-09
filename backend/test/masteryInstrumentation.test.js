import test from "node:test";
import assert from "node:assert/strict";
import { calculatePerformance, calculatePerformanceBreakdown } from "../src/services/mastery.js";

test("calculatePerformance's output is unchanged by the refactor — matches the breakdown's blended value exactly", () => {
  const cases = [
    { correctness: 1, confidence: 5, difficulty: 3 },
    { correctness: 0, confidence: 1, difficulty: 5 },
    { correctness: 0.5, confidence: 3, difficulty: 2 },
  ];
  for (const c of cases) {
    assert.equal(calculatePerformance(c), calculatePerformanceBreakdown(c).blended);
  }
});

test("breakdown exposes the individual sub-scores, not just the blend", () => {
  const breakdown = calculatePerformanceBreakdown({ correctness: 1, confidence: 5, difficulty: 5 });
  assert.ok("correctness" in breakdown);
  assert.ok("calibration" in breakdown);
  assert.ok("difficultyScore" in breakdown);
  assert.ok("blended" in breakdown);
  assert.equal(breakdown.correctness, 1);
  assert.equal(breakdown.difficultyScore, 1);
});
