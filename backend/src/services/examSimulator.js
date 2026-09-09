import mongoose from "mongoose";
import Concept from "../models/Concept.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import ExamSession from "../models/ExamSession.js";
import { rankConcepts } from "./nextAction.js";
import { evaluateQuestionAnswer, recordDurableAttempt } from "./adaptiveRuntime.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function pickClosestDifficulty(questions, targetDifficulty) {
  if (!questions.length) return null;
  return questions.slice().sort((a, b) => {
    const da = Math.abs((a.difficulty ?? 3) - targetDifficulty);
    const db = Math.abs((b.difficulty ?? 3) - targetDifficulty);
    return da - db;
  })[0];
}

/**
 * Builds the concept order for a mock exam. Uses the same priority ranking
 * as the next-best-action engine and the 20-minute session planner (see
 * rankConcepts in nextAction.js), so "what matters most to study" stays one
 * answer across the whole app rather than three different opinions.
 *
 * Concepts with no active question bank are excluded up front — no point
 * queuing a slot the exam can never actually fill.
 */
export async function startExam({ userId, courseId, totalQuestions = 20 }) {
  const ranked = await rankConcepts({ userId, courseId });
  if (!ranked) return null;
  if (!ranked.ranked.length) return { error: "NO_CONCEPTS" };

  const counts = await DiagnosticQuestion.aggregate([
    { $match: { course: new mongoose.Types.ObjectId(courseId), active: true } },
    { $unwind: "$conceptIds" },
    { $group: { _id: "$conceptIds", count: { $sum: 1 } } },
  ]);
  const questionCountByConcept = new Map(counts.map((c) => [String(c._id), c.count]));
  const eligible = ranked.ranked.filter((r) => questionCountByConcept.get(String(r.concept._id)) > 0);
  if (!eligible.length) return { error: "NO_QUESTIONS" };

  // Cyclic round-robin in priority order: every eligible concept gets a slot
  // before any concept gets a second one, so weaker/more-important concepts
  // get more coverage in longer exams without starving anything entirely.
  const conceptQueue = [];
  for (let i = 0; conceptQueue.length < totalQuestions; i++) {
    conceptQueue.push(eligible[i % eligible.length].concept._id);
  }

  const exam = await ExamSession.create({
    user: userId,
    course: courseId,
    conceptQueue,
    difficulty: 3,
  });
  return exam;
}

export async function getNextExamQuestion({ userId, examId }) {
  const exam = await ExamSession.findOne({ _id: examId, user: userId });
  if (!exam) return null;

  if (exam.status === "completed") {
    return { examId: exam._id, question: null, done: true, progress: { index: exam.currentIndex, total: exam.conceptQueue.length } };
  }

  const select = "_id course conceptIds question type options difficulty explanation cognitiveLevel";

  // Loop forward past any slot whose concept turns out to have no
  // answerable question left (should be rare — eligibility is checked at
  // exam start — but skipping beats leaving the client stuck on a question
  // that will never arrive). Any skips are persisted below before returning,
  // so a later call doesn't re-attempt the same empty slots.
  while (exam.currentIndex < exam.conceptQueue.length) {
    const conceptId = exam.conceptQueue[exam.currentIndex];
    const usedQuestionIds = exam.answers.map((a) => a.questionId);

    let candidates = await DiagnosticQuestion.find({
      course: exam.course, conceptIds: conceptId, active: true, _id: { $nin: usedQuestionIds },
    }).select(select).lean();
    // `answer` is deliberately excluded from this projection.

    if (!candidates.length) {
      // Question bank for this concept is exhausted within this exam —
      // allow a repeat rather than leaving the slot empty.
      candidates = await DiagnosticQuestion.find({ course: exam.course, conceptIds: conceptId, active: true }).select(select).lean();
    }

    const question = pickClosestDifficulty(candidates, exam.difficulty);
    if (question) {
      if (exam.isModified("currentIndex")) await exam.save();
      return { examId: exam._id, question, done: false, progress: { index: exam.currentIndex, total: exam.conceptQueue.length } };
    }

    // Genuinely nothing available for this concept anymore — skip the slot.
    exam.currentIndex += 1;
  }

  exam.status = "completed";
  exam.completedAt = new Date();
  await exam.save();
  return { examId: exam._id, question: null, done: true, progress: { index: exam.currentIndex, total: exam.conceptQueue.length } };
}

export async function recordExamAnswer({ userId, examId, questionId, answer, confidence, responseTimeMs }) {
  const exam = await ExamSession.findOne({ _id: examId, user: userId });
  if (!exam) return null;
  if (exam.status === "completed") throw new Error("This exam has already finished.");

  const evaluated = await evaluateQuestionAnswer({ questionId, answer });
  if (String(evaluated.question.course) !== String(exam.course)) {
    throw new Error("That question does not belong to this exam.");
  }
  // The question must belong to the concept this exam slot actually
  // queued — otherwise a client could submit answers to any question in
  // the course, cherry-picking ones it already knows and skipping the
  // concepts the exam plan chose to test, which would both invalidate the
  // adaptive difficulty stairstep and defeat the whole point of a mock exam.
  const expectedConceptId = exam.conceptQueue[exam.currentIndex];
  const questionConceptIds = evaluated.question.conceptIds.map(String);
  if (!expectedConceptId || !questionConceptIds.includes(String(expectedConceptId))) {
    throw new Error("That question isn't the one currently expected for this exam.");
  }

  // Position-scoped, not just question-scoped, so a repeated question later
  // in the same exam (bank-exhaustion fallback) is still recorded as its own
  // attempt instead of silently deduping against the earlier one.
  const eventId = `exam-${exam._id}-${exam.currentIndex}-${questionId}`;
  await recordDurableAttempt({
    userId,
    courseId: exam.course,
    eventId,
    conceptIds: evaluated.question.conceptIds,
    questionId,
    question: evaluated.question.question,
    answer,
    correct: evaluated.correct,
    score: evaluated.score,
    confidence,
    difficulty: evaluated.question.difficulty ?? 3,
    responseTimeMs,
    misconception: evaluated.misconception,
    misconceptionSeverity: evaluated.misconceptionSeverity,
  });

  exam.answers.push({
    questionId,
    conceptId: evaluated.question.conceptIds[0],
    correct: evaluated.correct,
    score: evaluated.score,
    difficulty: evaluated.question.difficulty ?? 3,
    confidence,
    misconception: evaluated.misconception,
  });
  exam.difficulty = clamp(exam.difficulty + (evaluated.correct ? 1 : -1), 1, 5);
  exam.currentIndex += 1;
  if (exam.currentIndex >= exam.conceptQueue.length) {
    exam.status = "completed";
    exam.completedAt = new Date();
  }
  await exam.save();

  return {
    exam,
    evaluated: { correct: evaluated.correct, score: evaluated.score, misconception: evaluated.misconception },
  };
}

export async function getExamReport({ userId, examId }) {
  const exam = await ExamSession.findOne({ _id: examId, user: userId }).lean();
  if (!exam) return null;

  const total = exam.answers.length;
  const avgScore = total ? exam.answers.reduce((n, a) => n + a.score, 0) / total : 0;
  const overallPct = Math.round(avgScore * 100);
  // A small sample gives a wide predicted range; more questions narrow it.
  const margin = Math.round(Math.max(3, 25 / Math.sqrt(Math.max(1, total))));

  const conceptIds = [...new Set(exam.answers.map((a) => String(a.conceptId)))];
  const concepts = await Concept.find({ _id: { $in: conceptIds } }).select("name").lean();
  const nameById = new Map(concepts.map((c) => [String(c._id), c.name]));

  const byConcept = new Map();
  for (const a of exam.answers) {
    const cid = String(a.conceptId);
    const bucket = byConcept.get(cid) || { conceptId: cid, name: nameById.get(cid) || "Unknown concept", attempts: 0, correct: 0, misconceptions: 0 };
    bucket.attempts += 1;
    bucket.correct += a.correct ? 1 : 0;
    if (a.misconception) bucket.misconceptions += 1;
    byConcept.set(cid, bucket);
  }
  const conceptBreakdown = [...byConcept.values()]
    .map((b) => ({ ...b, accuracy: b.attempts ? b.correct / b.attempts : 0 }))
    .sort((a, b) => a.accuracy - b.accuracy);

  return {
    examId: exam._id,
    status: exam.status,
    totalQuestions: exam.conceptQueue.length,
    answered: total,
    overallPct,
    predictedRange: [clamp(overallPct - margin, 0, 100), clamp(overallPct + margin, 0, 100)],
    conceptBreakdown,
    weak: conceptBreakdown.filter((c) => c.accuracy < 0.6 || c.misconceptions > 0),
    strong: conceptBreakdown.filter((c) => c.accuracy >= 0.8 && c.misconceptions === 0),
    startedAt: exam.startedAt,
    completedAt: exam.completedAt,
  };
}
