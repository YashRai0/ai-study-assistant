import test from "node:test";
import assert from "node:assert/strict";

// Replicates StudyFlowNav path generator
const STEPS = [
  { key: "chat", label: "Chat", path: (pdfId) => `/chat/${pdfId}` },
  { key: "summary", label: "Summary", path: (pdfId) => `/summary/${pdfId}` },
  { key: "flashcards", label: "Flashcards", path: (pdfId) => `/flashcards/${pdfId}` },
  { key: "quiz", label: "Quiz", path: (pdfId) => `/quiz/${pdfId}` },
  { key: "review", label: "Review", path: () => "/review" },
];

// Replicates Review queue forgetting risk labeler
function categorizeReviewItem(item) {
  const masteryPct = Math.round((item.mastery || 0) * 100);
  const isHighRisk = (item.forgettingRisk || 0) >= 0.5;
  return {
    masteryPct,
    isHighRisk,
    badgeText: isHighRisk ? "High Forgetting Risk" : "Due for Review",
  };
}

// Replicates KnowledgeMap reverse dependents calculation
function computeDependents(concepts) {
  const map = new Map();
  for (const concept of concepts) {
    const upstream = [...(concept.prerequisites || []), ...(concept.dependsOn || [])];
    for (const prereq of upstream) {
      const list = map.get(prereq._id) || [];
      list.push(concept);
      map.set(prereq._id, list);
    }
  }
  return map;
}

// Replicates KnowledgeMap blocked concept detection
function isConceptBlocked(concept, masteryMap) {
  const weakPrereqs = (concept.prerequisites || []).filter((p) => (masteryMap[p._id] || 0) < 0.5);
  const m = masteryMap[concept._id] || 0;
  return weakPrereqs.length > 0 && m < 0.5;
}

test("StudyFlowNav: generates correct routes for any document across all 5 study modes", () => {
  const pdfId = "6ad9d0297afe7954c5197254";
  assert.equal(STEPS.find((s) => s.key === "chat").path(pdfId), `/chat/${pdfId}`);
  assert.equal(STEPS.find((s) => s.key === "summary").path(pdfId), `/summary/${pdfId}`);
  assert.equal(STEPS.find((s) => s.key === "flashcards").path(pdfId), `/flashcards/${pdfId}`);
  assert.equal(STEPS.find((s) => s.key === "quiz").path(pdfId), `/quiz/${pdfId}`);
  assert.equal(STEPS.find((s) => s.key === "review").path(pdfId), "/review");
});

test("Review: classifies concepts with high forgetting risk correctly", () => {
  const highRiskItem = {
    conceptId: "c1",
    conceptName: "Backpropagation",
    mastery: 0.72,
    forgettingRisk: 0.65,
  };
  const result = categorizeReviewItem(highRiskItem);
  assert.equal(result.masteryPct, 72);
  assert.equal(result.isHighRisk, true);
  assert.equal(result.badgeText, "High Forgetting Risk");
});

test("Review: classifies normal spaced reviews accurately", () => {
  const normalItem = {
    conceptId: "c2",
    conceptName: "Linear Regression",
    mastery: 0.85,
    forgettingRisk: 0.35,
  };
  const result = categorizeReviewItem(normalItem);
  assert.equal(result.masteryPct, 85);
  assert.equal(result.isHighRisk, false);
  assert.equal(result.badgeText, "Due for Review");
});

test("KnowledgeMap: correctly inverts prerequisite relationships into unlocks/dependents", () => {
  const c1 = { _id: "c1", name: "Derivatives" };
  const c2 = { _id: "c2", name: "Gradient Descent", prerequisites: [c1] };
  const c3 = { _id: "c3", name: "Neural Networks", prerequisites: [c2] };

  const dependents = computeDependents([c1, c2, c3]);
  assert.equal(dependents.get("c1").length, 1);
  assert.equal(dependents.get("c1")[0].name, "Gradient Descent");
  assert.equal(dependents.get("c2").length, 1);
  assert.equal(dependents.get("c2")[0].name, "Neural Networks");
  assert.equal(dependents.get("c3"), undefined);
});

test("KnowledgeMap: detects blocked concepts when prerequisites have low mastery", () => {
  const prereq = { _id: "p1", name: "Limits" };
  const target = { _id: "t1", name: "Derivatives", prerequisites: [prereq] };

  // Case 1: Prereq is weak (< 0.5) and target is weak (< 0.5) -> Blocked
  assert.equal(isConceptBlocked(target, { p1: 0.3, t1: 0.2 }), true);

  // Case 2: Prereq is mastered (>= 0.5) -> Not blocked
  assert.equal(isConceptBlocked(target, { p1: 0.8, t1: 0.2 }), false);

  // Case 3: Target is already mastered (>= 0.5) -> Not blocked
  assert.equal(isConceptBlocked(target, { p1: 0.3, t1: 0.9 }), false);
});
