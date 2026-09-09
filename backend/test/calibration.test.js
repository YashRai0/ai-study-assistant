import test from "node:test";
import assert from "node:assert/strict";
import { calibrationGap, updateCalibration, calibrationLabel } from "../src/services/calibration.js";

test("wrong answer with high confidence produces a strongly negative gap (overconfidence)", () => {
  const gap = calibrationGap({ correctness: 0, confidence: 5 });
  assert.ok(gap < -0.5);
});

test("correct answer with low confidence produces a strongly positive gap (underconfidence)", () => {
  const gap = calibrationGap({ correctness: 1, confidence: 1 });
  assert.ok(gap > 0.5);
});

test("correct answer with high confidence is close to zero (well calibrated)", () => {
  const gap = calibrationGap({ correctness: 1, confidence: 5 });
  assert.ok(Math.abs(gap) < 0.1);
});

test("running calibration average moves toward repeated overconfident gaps", () => {
  let calibration = 0;
  let attempts = 0;
  for (let i = 0; i < 5; i++) {
    const gap = calibrationGap({ correctness: 0, confidence: 5 });
    calibration = updateCalibration(calibration, attempts, gap);
    attempts += 1;
  }
  assert.ok(calibration < -0.7);
});

test("calibrationLabel withholds judgment until there's enough evidence", () => {
  assert.equal(calibrationLabel(-0.9, 1), null);
  assert.equal(calibrationLabel(-0.9, 2), null);
  assert.equal(calibrationLabel(-0.9, 3), "overconfident");
  assert.equal(calibrationLabel(0.9, 3), "underconfident");
  assert.equal(calibrationLabel(0.1, 10), null);
});
