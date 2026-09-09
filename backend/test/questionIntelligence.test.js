import test from "node:test";
import assert from "node:assert/strict";
import { rankQuestions, scoreQuestion, targetDifficultyForMastery } from "../src/services/questionIntelligence.js";

test("target difficulty increases with mastery", () => {
  assert.ok(targetDifficultyForMastery(0.8) > targetDifficultyForMastery(0.2));
});

test("misconception repair favors explicitly targeted questions", () => {
  const questions = [
    { _id: "general", difficulty: 2.5, cognitiveLevel: "recall", attemptStats: { total: 0, correct: 0 }, targetsMisconception: false, createdAt: new Date(1) },
    { _id: "repair", difficulty: 2.5, cognitiveLevel: "recall", attemptStats: { total: 0, correct: 0 }, targetsMisconception: true, createdAt: new Date(2) },
  ];
  const ranked = rankQuestions({ questions, mastery: 0.3, actionType: "MISCONCEPTION_FIX", misconceptionRisk: 0.9, misconception: { description: "confuses photosynthesis", risk: 0.9 } });
  assert.equal(String(ranked[0].question._id), "repair");
});

test("selection prefers novel questions over recently attempted questions when fit is comparable", () => {
  const base = { difficulty: 3, cognitiveLevel: "application", attemptStats: { total: 10, correct: 5 }, targetsMisconception: false };
  const questions = [
    { ...base, _id: "old", createdAt: new Date(1) },
    { ...base, _id: "new", createdAt: new Date(2) },
  ];
  const ranked = rankQuestions({ questions, mastery: 0.55, recentQuestionIds: new Set(["old"]) });
  assert.equal(String(ranked[0].question._id), "new");
});

test("score exposes calibration and pedagogical fit", () => {
  const result = scoreQuestion({
    question: { _id: "q1", difficulty: 3, cognitiveLevel: "application", attemptStats: { total: 30, correct: 15 }, targetsMisconception: false },
    mastery: 0.55,
  });
  assert.ok(result.calibratedDifficulty >= 1 && result.calibratedDifficulty <= 5);
  assert.ok(result.signals.difficultyFit >= 0 && result.signals.difficultyFit <= 1);
  assert.ok(result.signals.cognitiveFit >= 0 && result.signals.cognitiveFit <= 1);
});
