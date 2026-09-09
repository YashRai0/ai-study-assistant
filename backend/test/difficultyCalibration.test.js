import test from "node:test";
import assert from "node:assert/strict";
import { calibrateDifficulty } from "../src/services/difficultyCalibration.js";

test("with zero attempts, trusts the author's static estimate entirely", () => {
  const { calibrated, confidence, empirical } = calibrateDifficulty({ staticDifficulty: 4, attemptStats: { total: 0, correct: 0 } });
  assert.equal(calibrated, 4);
  assert.equal(confidence, 0);
  assert.equal(empirical, null);
});

test("a small number of attempts only nudges the estimate slightly", () => {
  // Author said "easy" (2), but the first 2 attempts were both wrong —
  // shouldn't swing all the way to "hard" on 2 data points.
  const { calibrated } = calibrateDifficulty({ staticDifficulty: 2, attemptStats: { total: 2, correct: 0 } });
  assert.ok(calibrated > 2, "should move toward harder");
  assert.ok(calibrated < 4, "but not swing all the way on so little data");
});

test("many attempts with a low pass rate pull difficulty up toward the observed value", () => {
  // Author said "easy" (2), but 100 students, only 10% got it right.
  const { calibrated, confidence } = calibrateDifficulty({ staticDifficulty: 2, attemptStats: { total: 100, correct: 10 } });
  assert.equal(confidence, 1); // capped at full confidence
  assert.ok(calibrated > 4, "should be pulled strongly toward 'hard' given a 10% pass rate");
});

test("many attempts with a high pass rate pull difficulty down", () => {
  // Author said "hard" (5), but nearly everyone gets it right.
  const { calibrated } = calibrateDifficulty({ staticDifficulty: 5, attemptStats: { total: 100, correct: 95 } });
  assert.ok(calibrated < 2, "should be pulled toward 'easy' given a 95% pass rate");
});

test("confidence scales linearly with sample size up to the full-confidence threshold", () => {
  const half = calibrateDifficulty({ staticDifficulty: 3, attemptStats: { total: 15, correct: 5 } });
  const full = calibrateDifficulty({ staticDifficulty: 3, attemptStats: { total: 30, correct: 5 } });
  const overshoot = calibrateDifficulty({ staticDifficulty: 3, attemptStats: { total: 60, correct: 5 } });
  assert.equal(half.confidence, 0.5);
  assert.equal(full.confidence, 1);
  assert.equal(overshoot.confidence, 1); // never exceeds 1
});

test("calibrated value always stays within the valid 1-5 difficulty range", () => {
  const allWrong = calibrateDifficulty({ staticDifficulty: 1, attemptStats: { total: 50, correct: 0 } });
  const allRight = calibrateDifficulty({ staticDifficulty: 5, attemptStats: { total: 50, correct: 50 } });
  assert.ok(allWrong.calibrated <= 5 && allWrong.calibrated >= 1);
  assert.ok(allRight.calibrated <= 5 && allRight.calibrated >= 1);
});

test("agreement between author estimate and observed data leaves the value essentially unchanged", () => {
  // Author said "medium" (3); a 3/5 = 50% pass rate maps to exactly 3 too.
  const { calibrated } = calibrateDifficulty({ staticDifficulty: 3, attemptStats: { total: 100, correct: 50 } });
  assert.ok(Math.abs(calibrated - 3) < 0.01);
});
