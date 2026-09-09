import mongoose from "mongoose";
import Course from "../models/Course.js";
import Concept from "../models/Concept.js";
import StudentConcept from "../models/StudentConcept.js";
import Misconception from "../models/Misconception.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import Attempt from "../models/Attempt.js";
import DiagnosticSession from "../models/DiagnosticSession.js";
import LearningEvent from "../models/LearningEvent.js";
import { recordAttempt } from "./mastery.js";
import { evaluateFreeResponse } from "./llm.js";
import { getNextAction } from "./nextAction.js";
import { calibrationLabel } from "./calibration.js";
import { assessMisconceptionRisk, normalizeDomain } from "./misconceptionDetection.js";
import { rankQuestions, updateQuestionAttemptStats } from "./questionIntelligence.js";
import { retentionFraction } from "./masteryWithEbbinghaus.js";

const clamp = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export function readinessForConcept(concept, state, misconception, now = Date.now()) {
  const mastery = clamp(state?.mastery);
  const confidence = clamp(state?.confidence ?? 0.5);
  const prerequisiteReadiness = clamp(
    (concept.prerequisites || []).reduce((acc, id) => {
      const s = state?.prerequisiteStates?.find?.((x) => String(x.concept) === String(id));
      return Math.min(acc, clamp(s?.mastery ?? 0));
    }, 1)
  );
  const last = state?.lastReviewedAt ? new Date(state.lastReviewedAt).getTime() : 0;
  const ageDays = last ? Math.max(0, (now - last) / 864e5) : 30;
  // Always recompute from mastery + elapsed time rather than reading
  // state.retention directly. That stored field is set once, at review
  // time, to roughly "mastery as of this review" (see mastery.js's
  // recordAttempt: `retention: max(previous.retention, newMastery)`) — a
  // fine snapshot of retention *at that moment*, but it never decays on
  // its own afterward. Reading it straight (with a decay fallback that
  // only ever applied when the field was still null) meant a concept's
  // readiness score stopped accounting for forgetting the moment it had
  // any StudentConcept record at all, no matter how long ago that was.
  // nextAction.js and the /learning/... route at line ~634 already avoid
  // this same trap for forgettingRisk by recomputing live from
  // lastReviewedAt each time — this brings retention in line with that
  // same pattern instead of trusting a value that can be arbitrarily old.
  const retention = clamp(retentionFraction(mastery, ageDays));
  const misconceptionPenalty = misconception
    ? (misconception.severity === "high" ? 0.3 : misconception.severity === "medium" ? 0.18 : 0.08)
    : 0;
  return clamp(0.65 * mastery + 0.15 * confidence + 0.1 * prerequisiteReadiness + 0.1 * retention - misconceptionPenalty);
}

export async function getAdaptiveCourseState({ userId, courseId }) {
  if (!mongoose.isValidObjectId(courseId)) return null;
  const course = await Course.findOne({ _id: courseId, owner: userId }).lean();
  if (!course) return null;

  const [concepts, states, misconceptions] = await Promise.all([
    Concept.find({ course: courseId }).lean(),
    StudentConcept.find({ user: userId, course: courseId }).lean(),
    Misconception.find({ user: userId, course: courseId, resolved: false }).lean(),
  ]);

  const stateByConcept = new Map(states.map((s) => [String(s.concept), s]));
  const misconceptionByConcept = new Map();
  for (const m of misconceptions) {
    const key = String(m.concept);
    const old = misconceptionByConcept.get(key);
    if (!old || (m.severity === "high" && old.severity !== "high") || m.occurrences > old.occurrences) {
      misconceptionByConcept.set(key, m);
    }
  }

  const readiness = concepts.map((concept) => {
    const state = stateByConcept.get(String(concept._id));
    return {
      conceptId: String(concept._id),
      name: concept.name,
      importance: clamp(concept.importance),
      mastery: clamp(state?.mastery),
      confidence: clamp(state?.confidence ?? 0.5),
      calibration: state?.calibration ?? 0,
      calibrationLabel: calibrationLabel(state?.calibration ?? 0, state?.attempts ?? 0),
      readiness: readinessForConcept(concept, state, misconceptionByConcept.get(String(concept._id))),
      misconception: misconceptionByConcept.get(String(concept._id)) || null,
    };
  });

  const totalWeight = readiness.reduce((n, x) => n + Math.max(0.01, x.importance), 0);
  const examReadiness = totalWeight
    ? readiness.reduce((n, x) => n + x.readiness * Math.max(0.01, x.importance), 0) / totalWeight
    : 0;

  const nextAction = await getNextAction({ userId, courseId });

  const dueReviews = states
    .filter((s) => s.nextReviewAt && new Date(s.nextReviewAt) <= new Date())
    .sort((a, b) => (a.mastery || 0) - (b.mastery || 0))
    .slice(0, 10)
    .map((s) => String(s.concept));

  return {
    course: {
      id: course._id,
      title: course.title,
      examDate: course.examDate,
      targetScore: course.targetScore,
    },
    readiness: Math.round(examReadiness * 100),
    concepts: readiness,
    dueReviews,
    nextAction,
  };
}

export async function findQuestionForConcept({
  courseId, conceptId, mastery = 0,
  misconception = null, actionType = "PRACTICE",
  recentQuestionIds = new Set(), examUrgency = 0,
}) {
  const questions = await DiagnosticQuestion.find({
    course: courseId,
    conceptIds: conceptId,
    active: true,
  })
    .select("_id course conceptIds question type options difficulty explanation cognitiveLevel createdAt attemptStats evidenceRefs misconceptionTags targetsMisconception")
    .lean();
  // `answer` is deliberately excluded from this projection.
  if (!questions.length) return null;

  const misconceptionRisk = misconception
    ? (misconception.severity === "high" ? 1 : misconception.severity === "medium" ? 0.7 : 0.4)
    : 0;

  // rankQuestions (questionIntelligence.js) scores every candidate on
  // mastery gap, Bloom-level fit, calibrated-difficulty fit, statistical
  // uncertainty (how little real attempt data exists for this question
  // yet), misconception targeting, novelty (has this student already
  // seen it recently?), evidence grounding, and an exam-transfer boost —
  // replacing the previous pickClosestLevel-based version, which only
  // ever considered Bloom-level distance (tie-broken by raw difficulty).
  const [best] = rankQuestions({
    questions, mastery, misconception, misconceptionRisk, actionType,
    attemptedQuestionIds: recentQuestionIds, examUrgency,
  });
  const question = best?.question;
  if (question) { delete question.createdAt; delete question.attemptStats; delete question.misconceptionTags; delete question.targetsMisconception; } // internal-only, used for ranking above
  return question;
}

export async function getNextStudyItem({ userId, courseId }) {
  const state = await getAdaptiveCourseState({ userId, courseId });
  if (!state) return null;

  const action = state.nextAction;
  if (!action?.concept?.id) return { state, question: null };

  const conceptState = state.concepts.find((c) => c.conceptId === String(action.concept.id));
  const daysUntilExam = state.course.examDate
    ? Math.max(0, (new Date(state.course.examDate).getTime() - Date.now()) / 864e5)
    : 30;
  const examUrgency = clamp(1 - daysUntilExam / 30);

  // Recently-attempted questions on this concept, so rankQuestions' novelty
  // signal actually does something rather than treating every question as
  // unseen. Capped at the last 10 attempts — this only needs to avoid
  // immediate repeats, not build a full history.
  const recentAttempts = await Attempt.find({
    user: userId, course: courseId, conceptIds: action.concept.id, questionId: { $ne: null },
  })
    .select("questionId")
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  const recentQuestionIds = new Set(recentAttempts.map((a) => String(a.questionId)));

  const question = await findQuestionForConcept({
    courseId, conceptId: action.concept.id, mastery: action.concept.mastery,
    misconception: conceptState?.misconception || null,
    actionType: action.type,
    recentQuestionIds,
    examUrgency,
  });
  return { state, question };
}

export async function persistLearningEvent({
  userId,
  courseId,
  eventId,
  type = "attempt",
  conceptIds = [],
  payload = {},
  attemptId = null,
}) {
  if (!eventId) throw new Error("eventId is required");
  const existing = await LearningEvent.findOne({ user: userId, eventId }).lean();
  if (existing) return { applied: false, event: existing };

  const event = await LearningEvent.create({
    eventId,
    user: userId,
    course: courseId,
    attempt: attemptId,
    type,
    conceptIds,
    payload,
  });
  return { applied: true, event };
}


export async function evaluateQuestionAnswer({ questionId, answer }) {
  const question = await DiagnosticQuestion.findOne({ _id: questionId, active: true }).lean();
  if (!question) throw new Error("Question not found or inactive");

  if (question.type === "mcq") {
    const correct = String(answer || "").trim().toLowerCase() === String(question.answer || "").trim().toLowerCase();
    return {
      question,
      correct,
      score: correct ? 1 : 0,
      misconception: correct ? null : "Selected an incorrect option.",
      misconceptionSeverity: correct ? null : "medium",
    };
  }

  const evaluation = await evaluateFreeResponse({
    question: question.question,
    answer: String(answer || ""),
    expectedAnswer: question.answer,
    context: question.explanation || "",
  });

  return {
    question,
    correct: Boolean(evaluation.correct),
    score: clamp(evaluation.score),
    misconception: evaluation.correct ? null : (evaluation.misconception || "Answer does not demonstrate the expected understanding."),
    misconceptionSeverity: evaluation.correct ? null : (evaluation.misconceptionSeverity || "medium"),
  };
}

export async function recordDurableAttempt({
  userId,
  courseId,
  eventId,
  conceptIds,
  questionId = null,
  question = "",
  answer = "",
  correct,
  score,
  confidence,
  difficulty = 3,
  responseTimeMs = null,
  hintUsed = false,
  misconception = null,
  misconceptionSeverity = null,
  diagnosticSessionId = null,
}) {
  if (!eventId) throw new Error("eventId is required");

  const existingEvent = await LearningEvent.findOne({ user: userId, eventId }).lean();
  if (existingEvent?.attempt) {
    const attempt = await Attempt.findById(existingEvent.attempt).lean();
    return { applied: false, attempt, event: existingEvent };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const existingAttempt = await Attempt.findOne({ user: userId, eventId }).session(session).lean();
      if (existingAttempt) {
        result = { applied: false, attempt: existingAttempt };
        return;
      }

      const attempt = await Attempt.create([{
        user: userId,
        course: courseId,
        eventId,
        conceptIds,
        questionId,
        question,
        answer,
        correct,
        score: score ?? (correct ? 1 : 0),
        confidence,
        difficulty,
        responseTimeMs,
        hintUsed,
        misconception,
        misconceptionSeverity,
      }], { session });

      // If this attempt is part of a diagnostic session, log it there too
      // — same transaction, so the session's history can never drift out
      // of sync with the Attempt/LearningEvent records it's summarizing.
      // Ownership/status aren't re-validated here (the route already
      // checked the session belongs to this user and is active before
      // calling this); a session that's raced to "completed" by a
      // concurrent /diagnostic/next call in between simply doesn't get
      // this answer appended, which /diagnostic/next handles by treating
      // "no active session" as already-done rather than erroring.
      if (diagnosticSessionId) {
        await DiagnosticSession.updateOne(
          { _id: diagnosticSessionId, user: userId, status: "active" },
          {
            $push: {
              answers: {
                questionId, attemptId: attempt[0]._id, correct,
                score: score ?? (correct ? 1 : 0), confidence, conceptIds,
              },
            },
          },
          { session }
        );
      }

      if (questionId) {
        // Read-then-write (not the previous atomic $inc) because the
        // running average needs the prior total — safe here because this
        // whole block already runs inside recordDurableAttempt's
        // transaction: a genuine concurrent update to the same question
        // (e.g. two students answering it at once) is a real write
        // conflict, which withTransaction retries automatically, so the
        // retry recomputes the average against the actually-committed
        // prior state rather than a stale read.
        const currentQuestion = await DiagnosticQuestion.findById(questionId).select("attemptStats").session(session).lean();
        const nextStats = updateQuestionAttemptStats(currentQuestion || {}, { correct, responseTimeMs });
        await DiagnosticQuestion.updateOne(
          { _id: questionId },
          {
            $set: {
              "attemptStats.total": nextStats.total,
              "attemptStats.correct": nextStats.correct,
              "attemptStats.averageResponseTime": nextStats.averageResponseTime,
              "attemptStats.lastAttemptAt": new Date(),
            },
          },
          { session }
        );
      }

      let misconceptionRisk = 0;
      let assessmentsByConceptId = new Map();
      if (!correct && misconception) {
        const courseDoc = await Course.findById(courseId).select("subject").session(session).lean();
        const domain = normalizeDomain(courseDoc?.subject);
        const assessments = await Promise.all(conceptIds.map(async (conceptId) => {
          const assessment = await assessMisconceptionRisk({
            answer,
            domain,
            userId, courseId, conceptId,
            llmMisconception: misconception,
            llmSeverity: misconceptionSeverity,
            session,
          });
          return [conceptId, assessment];
        }));
        assessmentsByConceptId = new Map(assessments);
        misconceptionRisk = Math.max(...assessments.map(([, a]) => a.risk));
      }

      const attemptResults = await recordAttempt({
        userId, courseId, conceptIds,
        score: score ?? (correct ? 1 : 0),
        correct, confidence, difficulty, responseTimeMs, misconceptionRisk,
        session,
      });

      if (!correct && misconception) {
        for (const conceptId of conceptIds) {
          const assessment = assessmentsByConceptId.get(conceptId);
          const existing = await Misconception.findOne({
            user: userId, course: courseId, concept: conceptId, resolved: false,
          }).session(session);
          if (existing) {
            existing.occurrences += 1;
            existing.description = assessment?.description || misconception;
            existing.severity = assessment?.severity || misconceptionSeverity || existing.severity;
            existing.risk = assessment?.risk ?? existing.risk;
            existing.lastDetectedAt = new Date();
            existing.evidence.push({ attemptId: attempt[0]._id, text: String(answer || "").slice(0, 20000) });
            await existing.save({ session });
          } else {
            await Misconception.create([{
              user: userId, course: courseId, concept: conceptId,
              description: assessment?.description || misconception,
              severity: assessment?.severity || misconceptionSeverity || "medium",
              risk: assessment?.risk ?? 0.5,
              evidence: [{ attemptId: attempt[0]._id, text: String(answer || "").slice(0, 20000) }],
            }], { session });
          }
        }
      }

      let questionCognitiveLevel = null;
      if (questionId) {
        const q = await DiagnosticQuestion.findById(questionId).select("cognitiveLevel").session(session).lean();
        questionCognitiveLevel = q?.cognitiveLevel ?? null;
      }

      const [event] = await LearningEvent.create([{
        eventId,
        user: userId,
        course: courseId,
        attempt: attempt[0]._id,
        type: "attempt",
        conceptIds,
        payload: {
          score: score ?? (correct ? 1 : 0),
          correct,
          confidence,
          difficulty,
          responseTimeMs,
          misconception: misconception || null,
          misconceptionSeverity: misconceptionSeverity || null,
          misconceptionRisk,
          cognitiveLevel: questionCognitiveLevel,
          // Instrumentation for eventually validating the mastery model
          // against real outcomes (per the review: "Don't replace it yet.
          // Instrument it first.") — the sub-scores that went into this
          // attempt's performance number, and the per-concept mastery
          // delta it produced. Deliberately NOT including
          // prerequisiteReadiness here — computing it accurately means
          // fetching mastery for every prerequisite of every concept this
          // attempt touched, which is a real added cost inside a
          // transaction that's already doing several round trips;
          // nextAction.js's ranking is the natural place that signal
          // already lives, and duplicating it here for instrumentation
          // alone isn't worth that cost.
          performanceBreakdown: attemptResults.performanceBreakdown,
          masteryBefore: attemptResults.masteryBefore,
          masteryAfter: Object.fromEntries(attemptResults.map((r) => [String(r.concept), r.mastery])),
        },
      }], { session });

      result = { applied: true, attempt: attempt[0], event };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
