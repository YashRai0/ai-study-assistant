import test from "node:test";
import assert from "node:assert/strict";
import {
  formatExamTimer,
  getTimerUrgency,
  toggleFlaggedQuestion,
  predictGradeBand,
  calculateCognitivePerformance
} from "../src/utils/examHelpers.js";

test("formatExamTimer formats milliseconds to mm:ss and hh:mm:ss", () => {
  assert.equal(formatExamTimer(0), "0:00");
  assert.equal(formatExamTimer(-100), "0:00");
  assert.equal(formatExamTimer(65000), "1:05");
  assert.equal(formatExamTimer(3600000), "1:00:00");
  assert.equal(formatExamTimer(3665000), "1:01:05");
});

test("getTimerUrgency classifies urgency states correctly", () => {
  assert.equal(getTimerUrgency(0), "expired");
  assert.equal(getTimerUrgency(60000), "critical"); // 1 min <= 2 min
  assert.equal(getTimerUrgency(240000, 1800000), "warning"); // 4 min <= 5 min
  assert.equal(getTimerUrgency(900000, 1800000), "normal"); // 15 min
});

test("toggleFlaggedQuestion toggles question ids in list", () => {
  const initial = ["q1", "q2"];
  const added = toggleFlaggedQuestion(initial, "q3");
  assert.deepEqual(added, ["q1", "q2", "q3"]);

  const removed = toggleFlaggedQuestion(added, "q2");
  assert.deepEqual(removed, ["q1", "q3"]);

  // Edge cases
  assert.deepEqual(toggleFlaggedQuestion(initial, null), initial);
});

test("predictGradeBand categorizes percentages into grade bands", () => {
  assert.equal(predictGradeBand(95).band, "A+ (High Distinction)");
  assert.equal(predictGradeBand(85).band, "A (Distinction)");
  assert.equal(predictGradeBand(75).band, "B (Merit)");
  assert.equal(predictGradeBand(62).band, "C (Pass)");
  assert.equal(predictGradeBand(45).band, "Developing");
});

test("calculateCognitivePerformance aggregates by Bloom domain", () => {
  const items = [
    { cognitiveLevel: "remember", correct: true },
    { cognitiveLevel: "remember", correct: false },
    { cognitiveLevel: "apply", correct: true },
    { cognitiveLevel: "apply", correct: true },
  ];
  const perf = calculateCognitivePerformance(items);
  const rememberDomain = perf.find((p) => p.domain === "Remember");
  assert.equal(rememberDomain.total, 2);
  assert.equal(rememberDomain.correct, 1);
  assert.equal(rememberDomain.percentage, 50);

  const applyDomain = perf.find((p) => p.domain === "Apply");
  assert.equal(applyDomain.total, 2);
  assert.equal(applyDomain.correct, 2);
  assert.equal(applyDomain.percentage, 100);
});
