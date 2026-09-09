import test from "node:test";
import assert from "node:assert/strict";
import { explainNextBestAction } from "../src/services/adaptiveExplanation.js";

test("low mastery produces a mastery-percentage reason", () => {
  const result = explainNextBestAction({ conceptName: "Glycolysis", mastery: 0.3 });
  assert.ok(result.reasons.some((r) => r.includes("30%")));
});

test("prerequisite-blocked concepts lead with the prerequisite reason", () => {
  const result = explainNextBestAction({ conceptName: "Krebs Cycle", mastery: 0.6, prerequisiteBlocked: true });
  assert.equal(result.reasons[0], "A prerequisite needs attention before this concept.");
});

test("high misconception risk adds its own reason even with decent mastery", () => {
  const result = explainNextBestAction({ conceptName: "Photosynthesis", mastery: 0.7, misconceptionRisk: 0.8 });
  assert.ok(result.reasons.some((r) => r.includes("misconception")));
});

test("due for review or low retention adds a retention reason", () => {
  const dueResult = explainNextBestAction({ conceptName: "X", mastery: 0.8, retention: 0.9, dueForReview: true });
  assert.ok(dueResult.reasons.some((r) => r.includes("Retention")));

  const lowRetentionResult = explainNextBestAction({ conceptName: "X", mastery: 0.8, retention: 0.2, dueForReview: false });
  assert.ok(lowRetentionResult.reasons.some((r) => r.includes("Retention")));
});

test("recent failures are called out with correct singular/plural wording", () => {
  const one = explainNextBestAction({ conceptName: "X", mastery: 0.8, retention: 0.9, recentFailureCount: 1 });
  assert.ok(one.reasons.some((r) => r === "1 recent unsuccessful attempt was recorded."));

  const three = explainNextBestAction({ conceptName: "X", mastery: 0.8, retention: 0.9, recentFailureCount: 3 });
  assert.ok(three.reasons.some((r) => r === "3 recent unsuccessful attempts were recorded."));
});

test("a strong concept with nothing wrong falls back to a generic reason rather than an empty list", () => {
  const result = explainNextBestAction({ conceptName: "X", mastery: 0.9, retention: 0.9 });
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /highest-value/);
});

test("missing conceptName falls back to a generic label instead of undefined", () => {
  const result = explainNextBestAction({ mastery: 0.9, retention: 0.9 });
  assert.equal(result.conceptName, "this concept");
});

test("summary is all reasons joined into one string", () => {
  const result = explainNextBestAction({ conceptName: "X", mastery: 0.3, misconceptionRisk: 0.8 });
  assert.equal(result.summary, result.reasons.join(" "));
});
