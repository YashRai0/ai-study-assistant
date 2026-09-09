import { calibrateDifficulty } from "./difficultyCalibration.js";
import { LEVELS, targetLevelForMastery } from "./cognitiveLevel.js";

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function targetDifficultyForMastery(mastery, { actionType = "PRACTICE", misconceptionRisk = 0, examUrgency = 0 } = {}) {
  const m = clamp(mastery);
  let target = 1 + m * 4;
  if (actionType === "TEACH" || actionType === "PREREQUISITE_GAP") target -= 0.5;
  if (actionType === "REVIEW") target -= 0.15;
  if (actionType === "TEST") target += 0.35;
  if (actionType === "MISCONCEPTION_FIX") target -= 0.35 * clamp(misconceptionRisk);
  target += 0.2 * clamp(examUrgency) * m;
  return Math.max(1, Math.min(5, target));
}

export function scoreQuestion(questionOrArgs, maybeOptions = {}) {
  const args = questionOrArgs?.question && typeof questionOrArgs.question === "object"
    ? questionOrArgs
    : { ...maybeOptions, question: questionOrArgs };
  const {
    question,
    mastery = 0.5,
    misconception = null,
    misconceptionRisk = 0,
    recentQuestionIds = new Set(),
    attemptedQuestionIds = recentQuestionIds,
    actionType = "PRACTICE",
    targetCognitiveLevel = null,
    examUrgency = 0,
  } = args;
  const calibrated = calibrateDifficulty({ staticDifficulty: question.difficulty, attemptStats: question.attemptStats }).calibrated;
  const targetLevel = targetCognitiveLevel || targetLevelForMastery(mastery);
  const targetIndex = LEVELS.indexOf(targetLevel);
  const levelIndex = LEVELS.indexOf(question.cognitiveLevel);
  const levelDistance = targetIndex < 0 || levelIndex < 0 ? 2 : Math.abs(targetIndex - levelIndex);
  const cognitiveFit = 1 - clamp(levelDistance / Math.max(1, LEVELS.length - 1));
  const preferredDifficulty = targetDifficultyForMastery(mastery, { actionType, misconceptionRisk, examUrgency });
  const difficultyFit = 1 - clamp(Math.abs(calibrated - preferredDifficulty) / 4);
  const uncertainty = question.attemptStats?.total ? 1 - clamp(question.attemptStats.total / 30) : 1;
  const novelty = attemptedQuestionIds.has(String(question._id)) ? 0 : 1;
  const evidence = Array.isArray(question.evidenceRefs) && question.evidenceRefs.length ? 1 : 0;
  const misconceptionText = String(misconception?.description || misconception?.misconception || "").toLowerCase();
  const tags = Array.isArray(question.misconceptionTags) ? question.misconceptionTags : [];
  const tagMatch = misconceptionText && tags.some((tag) => misconceptionText.includes(String(tag).toLowerCase()));
  const misconceptionTarget = misconception
    ? (question.targetsMisconception ? (tagMatch ? 1 : 0.7) : (tagMatch ? 0.8 : 0.15))
    : 0;
  const transferBoost = actionType === "TEST" && ["analysis", "transfer"].includes(question.cognitiveLevel) ? 1 : 0;
  const score =
    0.26 * (1 - clamp(mastery)) + 0.24 * cognitiveFit + 0.22 * difficultyFit +
    0.10 * uncertainty + 0.08 * misconceptionTarget + 0.06 * novelty +
    0.02 * evidence + 0.02 * transferBoost;
  return { score, calibratedDifficulty: calibrated, targetDifficulty: preferredDifficulty, targetLevel,
    difficultyFit, cognitiveFit, uncertainty, misconceptionTarget, novelty, evidence,
    signals: { masteryGap: 1 - clamp(mastery), cognitiveFit, difficultyFit, uncertainty, misconceptionTarget, novelty, evidence, transferBoost } };
}

export function rankQuestions(questionsOrArgs, maybeOptions = {}) {
  const args = Array.isArray(questionsOrArgs) ? { ...maybeOptions, questions: questionsOrArgs } : questionsOrArgs;
  const { questions = [] } = args || {};
  return questions.map((question) => ({ question, ...scoreQuestion({ ...args, question }) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.signals.cognitiveFit !== a.signals.cognitiveFit) return b.signals.cognitiveFit - a.signals.cognitiveFit;
      return new Date(a.question.createdAt || 0) - new Date(b.question.createdAt || 0);
    });
}

export function updateQuestionAttemptStats(question, { correct, responseTimeMs = null }) {
  const total = Number(question.attemptStats?.total || 0);
  const nextTotal = total + 1;
  const nextCorrect = Number(question.attemptStats?.correct || 0) + (correct ? 1 : 0);
  const oldAvg = Number(question.attemptStats?.averageResponseTime || 0);
  const nextAverageResponseTime = responseTimeMs == null ? oldAvg : ((oldAvg * total) + Number(responseTimeMs)) / nextTotal;
  return { total: nextTotal, correct: nextCorrect, averageResponseTime: nextAverageResponseTime };
}
