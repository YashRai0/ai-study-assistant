import test from "node:test";
import assert from "node:assert/strict";
import { selectNextDiagnosticQuestion } from "../src/services/diagnosticEngine.js";

function concept(id, { prerequisites = [], dependsOn = [], importance = 0.5, name } = {}) {
  return { _id: id, name: name || id, prerequisites, dependsOn, importance };
}

function question(id, { conceptIds, difficulty = 3, cognitiveLevel = "recall" } = {}) {
  return { _id: id, conceptIds, difficulty, cognitiveLevel, createdAt: new Date() };
}

test("with no answers yet, returns a question for an unprobed foundational concept", () => {
  const glucose = concept("glucose", { importance: 0.9 });
  const q1 = question("q1", { conceptIds: ["glucose"] });

  const result = selectNextDiagnosticQuestion({ concepts: [glucose], questions: [q1], answered: [] });

  assert.equal(result.done, false);
  assert.equal(result.question._id, "q1");
  assert.equal(result.reason, "unprobed_concept");
});

test("a concept with an unprobed prerequisite is skipped until the prerequisite is probed", () => {
  const glucose = concept("glucose", { importance: 0.5 });
  const krebs = concept("krebs", { prerequisites: ["glucose"], importance: 0.9 }); // higher importance, but gated
  const glucoseQ = question("gq", { conceptIds: ["glucose"] });
  const krebsQ = question("kq", { conceptIds: ["krebs"] });

  // Krebs has higher importance, but its prerequisite (glucose) hasn't
  // been probed yet — glucose should be selected first despite lower
  // importance, proving prerequisite gating actually overrides raw
  // importance ranking.
  const result = selectNextDiagnosticQuestion({
    concepts: [krebs, glucose],
    questions: [krebsQ, glucoseQ],
    answered: [],
  });

  assert.equal(result.question._id, "gq");
});

test("once the prerequisite is probed, the dependent concept becomes selectable", () => {
  const glucose = concept("glucose");
  const krebs = concept("krebs", { prerequisites: ["glucose"] });
  const glucoseQ = question("gq", { conceptIds: ["glucose"] });
  const krebsQ = question("kq", { conceptIds: ["krebs"] });

  const result = selectNextDiagnosticQuestion({
    concepts: [krebs, glucose],
    questions: [krebsQ, glucoseQ],
    answered: [{ questionId: "gq", correct: true }],
  });

  assert.equal(result.question._id, "kq");
});

test("question 2 targets a harder level after question 1 was answered correctly", () => {
  const c = concept("c", { importance: 0.5 });
  const easy = question("easy", { conceptIds: ["c"], cognitiveLevel: "recognition" });
  const hard = question("hard", { conceptIds: ["c"], cognitiveLevel: "transfer" });

  // Answered the first question on this concept correctly -> running
  // estimate is 1.0 -> targetLevelForMastery(1.0) should favor "transfer",
  // proving question 2's difficulty genuinely depends on question 1's result.
  const result = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [easy, hard],
    answered: [{ questionId: "already-answered-elsewhere", correct: true }],
  });

  // Set up more directly: probe once correctly, then ask what's next for
  // the SAME concept (second question on it, since MAX_QUESTIONS_PER_CONCEPT=2).
  const firstProbe = question("first", { conceptIds: ["c"], cognitiveLevel: "recognition" });
  const second = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [firstProbe, easy, hard],
    answered: [{ questionId: "first", correct: true }],
  });
  assert.equal(second.question._id, "hard");
});

test("question 2 targets an easier level after question 1 was answered incorrectly", () => {
  const c = concept("c");
  const firstProbe = question("first", { conceptIds: ["c"], cognitiveLevel: "application" });
  const easy = question("easy", { conceptIds: ["c"], cognitiveLevel: "recognition" });
  const hard = question("hard", { conceptIds: ["c"], cognitiveLevel: "transfer" });

  const result = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [firstProbe, easy, hard],
    answered: [{ questionId: "first", correct: false }],
  });

  assert.equal(result.question._id, "easy");
});

test("prioritizes breadth: an unprobed concept beats a second question on an already-probed one", () => {
  const a = concept("a", { importance: 0.5 });
  const b = concept("b", { importance: 0.5 });
  const aQ1 = question("aQ1", { conceptIds: ["a"] });
  const aQ2 = question("aQ2", { conceptIds: ["a"] });
  const bQ1 = question("bQ1", { conceptIds: ["b"] });

  const result = selectNextDiagnosticQuestion({
    concepts: [a, b],
    questions: [aQ1, aQ2, bQ1],
    answered: [{ questionId: "aQ1", correct: true }],
  });

  assert.equal(result.question._id, "bQ1");
});

test("stops once maxQuestions is reached", () => {
  const c = concept("c");
  const q1 = question("q1", { conceptIds: ["c"] });
  const result = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [q1],
    answered: [{ questionId: "prior1", correct: true }, { questionId: "prior2", correct: true }],
    maxQuestions: 2,
  });
  assert.deepEqual(result, { done: true, reason: "max_questions_reached" });
});

test("stops once every concept's question bank is exhausted", () => {
  const c = concept("c");
  const q1 = question("q1", { conceptIds: ["c"] });
  const result = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [q1],
    answered: [{ questionId: "q1", correct: true }],
  });
  assert.equal(result.done, true);
  assert.equal(result.reason, "question_bank_exhausted");
});

test("falls back to an under-probed concept when nothing is prerequisite-ready (e.g. every prerequisite lacks its own question)", () => {
  // "b" depends on "a", but "a" has no question in the bank at all, so it
  // can never become "probed" through normal means — without a fallback,
  // this would stall the diagnostic forever.
  const a = concept("a");
  const b = concept("b", { prerequisites: ["a"] });
  const bQ = question("bq", { conceptIds: ["b"] });

  const result = selectNextDiagnosticQuestion({ concepts: [a, b], questions: [bQ], answered: [] });

  assert.equal(result.done, false);
  assert.equal(result.question._id, "bq");
});

test("empty concept or question bank stops immediately", () => {
  assert.deepEqual(selectNextDiagnosticQuestion({ concepts: [], questions: [], answered: [] }), { done: true, reason: "empty_bank" });
});

test("an answered questionId no longer in the active bank doesn't crash the estimate builder", () => {
  const c = concept("c");
  const q1 = question("q1", { conceptIds: ["c"] });
  const result = selectNextDiagnosticQuestion({
    concepts: [c],
    questions: [q1],
    answered: [{ questionId: "some-deleted-question", correct: true }],
  });
  assert.equal(result.done, false);
  assert.equal(result.question._id, "q1");
});
