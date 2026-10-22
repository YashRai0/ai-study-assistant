import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDiagnosticScore,
  getDifficultyLabel,
  getCognitiveBadge,
  getConfidenceFeedback,
  generateDiagnosticCertificateData
} from "../src/utils/diagnosticHelpers.js";

test("calculateDiagnosticScore calculates bounded percentages", () => {
  assert.equal(calculateDiagnosticScore(0, 0), 0);
  assert.equal(calculateDiagnosticScore(10, 8), 80);
  assert.equal(calculateDiagnosticScore(5, 5), 100);
  assert.equal(calculateDiagnosticScore(5, 0), 0);
  // Clamped bounds
  assert.equal(calculateDiagnosticScore(4, 10), 100);
});

test("getDifficultyLabel handles 1-5 levels with colors and labels", () => {
  const d1 = getDifficultyLabel(1);
  assert.equal(d1.level, 1);
  assert.equal(d1.label, "Foundational");

  const d3 = getDifficultyLabel(3);
  assert.equal(d3.level, 3);
  assert.equal(d3.label, "Intermediate");

  const d5 = getDifficultyLabel(5);
  assert.equal(d5.level, 5);
  assert.equal(d5.label, "Mastery");

  // Defaults and clamps
  assert.equal(getDifficultyLabel(0).level, 1);
  assert.equal(getDifficultyLabel(99).level, 5);
});

test("getCognitiveBadge maps Bloom levels properly", () => {
  assert.equal(getCognitiveBadge("remember").label, "Recall");
  assert.equal(getCognitiveBadge("understand").label, "Comprehension");
  assert.equal(getCognitiveBadge("apply").label, "Application");
  assert.equal(getCognitiveBadge("analyze").label, "Analysis");
  assert.equal(getCognitiveBadge("evaluate").label, "Evaluation");
  assert.equal(getCognitiveBadge("create").label, "Synthesis");
});

test("getConfidenceFeedback detects calibration and misconceptions", () => {
  // Correct + High confidence
  const conf1 = getConfidenceFeedback(5, true);
  assert.equal(conf1.type, "calibrated-high");

  // Correct + Low confidence
  const conf2 = getConfidenceFeedback(2, true);
  assert.equal(conf2.type, "under-confident");

  // Incorrect + High confidence (misconception)
  const conf3 = getConfidenceFeedback(4, false);
  assert.equal(conf3.type, "over-confident-misconception");

  // Incorrect + Low confidence (expected gap)
  const conf4 = getConfidenceFeedback(2, false);
  assert.equal(conf4.type, "expected-gap");
});

test("generateDiagnosticCertificateData produces certificate tiers", () => {
  const certHigh = generateDiagnosticCertificateData({
    courseTitle: "Distributed Systems",
    answeredCount: 8,
    scorePercentage: 90
  });
  assert.equal(certHigh.tier, "Advanced Scholar");
  assert.equal(certHigh.scorePercentage, 90);
  assert.match(certHigh.id, /^DIAG-/);

  const certMid = generateDiagnosticCertificateData({
    courseTitle: "Algorithms",
    answeredCount: 6,
    scorePercentage: 72
  });
  assert.equal(certMid.tier, "Proficient");

  const certLow = generateDiagnosticCertificateData({
    courseTitle: "Physics",
    answeredCount: 5,
    scorePercentage: 30
  });
  assert.equal(certLow.tier, "Foundation");
});
