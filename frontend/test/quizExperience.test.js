import test from "node:test";
import assert from "node:assert/strict";

function scoreObjectiveQuiz(quiz, answers) {
  if (!quiz) return { correct: 0, total: 0, percentage: 0 };
  let correct = 0;
  let total = 0;

  quiz.mcq?.forEach((q, i) => {
    total++;
    if (answers[`mcq-${i}`] === q.answer) correct++;
  });

  quiz.trueFalse?.forEach((q, i) => {
    total++;
    if (answers[`tf-${i}`] === q.answer) correct++;
  });

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, percentage };
}

function resolveCelebrationTier(percentage) {
  if (percentage >= 80) return "mastery";
  if (percentage >= 50) return "progress";
  return "reinforcement";
}

test("QuizExperience: calculates objective score and percentage accurately", () => {
  const quiz = {
    mcq: [
      { question: "Q1", answer: "A" },
      { question: "Q2", answer: "B" },
    ],
    trueFalse: [
      { question: "Q3", answer: true },
      { question: "Q4", answer: false },
    ],
  };

  const answers = {
    "mcq-0": "A",
    "mcq-1": "C", // wrong
    "tf-0": true,
    "tf-1": true,  // wrong
  };

  const result = scoreObjectiveQuiz(quiz, answers);
  assert.equal(result.correct, 2);
  assert.equal(result.total, 4);
  assert.equal(result.percentage, 50);
});

test("QuizExperience: resolves correct celebration tier", () => {
  assert.equal(resolveCelebrationTier(85), "mastery");
  assert.equal(resolveCelebrationTier(80), "mastery");
  assert.equal(resolveCelebrationTier(65), "progress");
  assert.equal(resolveCelebrationTier(50), "progress");
  assert.equal(resolveCelebrationTier(40), "reinforcement");
});
