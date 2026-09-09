import mongoose from "mongoose";
import StudentConcept from "../models/StudentConcept.js";
import { calibrationGap, updateCalibration } from "./calibration.js";
import { retentionFraction } from "./masteryWithEbbinghaus.js";
import { scheduleNextReview, QUALITY } from "./spacedRepetition.js";
import { recordMasteryDelta } from "./adaptiveMetrics.js";
import logger from "../utils/logger.js";

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Same computation as calculatePerformance, but returns the individual
 * sub-scores instead of only the final blend. This doesn't change what
 * the mastery model DOES — the review was explicit: "Don't replace it
 * yet. Instrument it first." — it just exposes the components so each
 * attempt's LearningEvent can record what went into the number, which is
 * what validating the model against real outcomes later actually needs
 * (you can't tell whether the calibration term is pulling its weight if
 * only the final blended score was ever persisted).
 */
export function calculatePerformanceBreakdown({ correctness, confidence = 3, difficulty = 3 }) {
  const c = clamp(Number(correctness));
  const conf = clamp(Number(confidence) / 5);
  const calibration = c >= 0.5 ? conf : 1 - conf;
  const difficultyScore = clamp(Number(difficulty) / 5);
  const blended = clamp(c * 0.6 + calibration * 0.15 + difficultyScore * 0.25);
  return { correctness: c, calibration, difficultyScore, blended };
}

export function calculatePerformance(args) {
  return calculatePerformanceBreakdown(args).blended;
}

export function calculateMastery(oldMastery, performance) {
  return clamp(Number(oldMastery) * 0.7 + Number(performance) * 0.3);
}

export function calculateForgettingRisk(lastReviewedAt, mastery = 1) {
  if (!lastReviewedAt) return 0.5;
  const ageDays = Math.max(0, (Date.now() - new Date(lastReviewedAt).getTime()) / 864e5);
  // Higher mastery decays more slowly (a stronger memory trace), matching
  // the same Ebbinghaus curve masteryWithEbbinghaus.js uses — previously
  // this used a fixed 72-hour decay constant regardless of mastery, so a
  // concept mastered at 0.95 and one barely learned at 0.2 were treated as
  // forgotten at the identical rate, which isn't how forgetting works.
  return clamp(1 - retentionFraction(clamp(mastery), ageDays));
}

/**
 * Converts an attempt's correctness/score/confidence (plus any lingering
 * misconception risk) into an SM-2 quality rating (0-5) — flashcards get
 * this directly from an explicit Again/Hard/Good/Easy button, but a
 * diagnostic/adaptive-tutor attempt has no such button, so it's derived
 * from what the attempt actually measured instead. A high misconception
 * risk caps this at HARD even on a technically-correct answer: a
 * lingering misconception means the recall is shakier than a clean
 * correct answer suggests, and SM-2 should grow the interval more
 * cautiously for it, not treat it as an easy win.
 */
export function deriveReviewQuality({ correct, score = null, confidence = 3, misconceptionRisk = 0 }) {
  const effectiveScore = score ?? (correct ? 1 : 0);
  if (!correct || effectiveScore < 0.4) return QUALITY.AGAIN;
  if (clamp(misconceptionRisk) >= 0.5) return QUALITY.HARD;
  if (effectiveScore >= 0.85 && confidence >= 4) return QUALITY.EASY;
  if (effectiveScore >= 0.6) return QUALITY.GOOD;
  return QUALITY.HARD;
}

/**
 * Reads StudentConcept, computes the next mastery/confidence/calibration
 * values in JS, then writes them back. That read-then-write is only safe
 * from concurrent corruption when it happens inside a single-document-per-
 * transaction snapshot — a bare findOne+findOneAndUpdate lets two
 * concurrent attempts (double-submit, client retry) both read the same
 * stale `previous.mastery` and race on the final $set, silently dropping
 * one attempt's effect on mastery even though its $inc'd counters
 * (attempts/correct/incorrect) still land. `recordAttempt` (below) always
 * runs this inside a transaction — either the caller's own (passed in via
 * `session`, e.g. recordDurableAttempt) or one it opens itself — so this
 * function should not be called directly outside that wrapper.
 */
async function recordAttemptInSession({
  userId,
  courseId,
  conceptIds,
  score,
  correct,
  confidence,
  difficulty,
  responseTimeMs,
  misconceptionRisk,
  session,
}) {
  const results = [];
  const masteryBefore = {};
  const performanceBreakdown = calculatePerformanceBreakdown({ correctness: score ?? (correct ? 1 : 0), confidence, difficulty });
  const performance = performanceBreakdown.blended;
  const gap = calibrationGap({ correctness: score ?? (correct ? 1 : 0), confidence });

  for (const conceptId of conceptIds) {
    const existing = await StudentConcept.findOne({ user: userId, course: courseId, concept: conceptId }).session(session);
    const previous = existing?.toObject() || {
      mastery: 0, confidence: 0.5, calibration: 0, retention: 1, attempts: 0, correct: 0, incorrect: 0,
      srsEaseFactor: 2.5, srsInterval: 0, srsRepetitions: 0,
    };
    masteryBefore[String(conceptId)] = previous.mastery;
    const attempts = previous.attempts + 1;
    const newMastery = calculateMastery(previous.mastery, performance);
    const newConfidence = clamp(((previous.confidence * previous.attempts) + clamp(Number(confidence) / 5)) / attempts);
    const newCalibration = updateCalibration(previous.calibration, previous.attempts, gap);
    const newCorrect = previous.correct + (correct ? 1 : 0);
    const newIncorrect = previous.incorrect + (correct ? 0 : 1);
    const quality = deriveReviewQuality({ correct, score, confidence, misconceptionRisk });
    const schedule = scheduleNextReview(
      { easeFactor: previous.srsEaseFactor ?? 2.5, interval: previous.srsInterval ?? 0, repetitions: previous.srsRepetitions ?? 0 },
      quality
    );
    const doc = await StudentConcept.findOneAndUpdate(
      { user: userId, course: courseId, concept: conceptId },
      {
        $set: {
          mastery: newMastery,
          confidence: newConfidence,
          calibration: newCalibration,
          retention: clamp(Math.max(previous.retention, newMastery)),
          averageResponseTime: responseTimeMs == null ? previous.averageResponseTime : ((previous.averageResponseTime ?? responseTimeMs) * previous.attempts + responseTimeMs) / attempts,
          forgettingRisk: calculateForgettingRisk(new Date(), Math.max(previous.retention, newMastery)),
          misconceptionRisk: clamp(misconceptionRisk),
          srsEaseFactor: schedule.easeFactor,
          srsInterval: schedule.interval,
          srsRepetitions: schedule.repetitions,
          lastReviewedAt: new Date(),
          nextReviewAt: schedule.nextReviewDate,
        },
        $inc: { attempts: 1, correct: correct ? 1 : 0, incorrect: correct ? 0 : 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, session }
    );
    results.push(doc);

    // Best-effort instrumentation, not correctness-critical: wrapped so a
    // metric-write failure can never abort the real mastery update this
    // is describing. See adaptiveMetrics.js — this is the one place in
    // the app all three attempt paths (durable, evaluate, tutor/respond)
    // funnel through, so it's the single choke point to log from rather
    // than duplicating this call at each route.
    try {
      await recordMasteryDelta({
        user: userId, course: courseId, concept: conceptId,
        before: previous.mastery, after: newMastery,
        session,
      });
    } catch (err) {
      logger.warn({ err, userId, courseId, conceptId }, "Failed to record mastery-delta metric (non-fatal)");
    }
  }

  // Attached as extra properties on the array rather than changing the
  // return shape to {results, ...} — arrays are objects in JS, so this is
  // fully backward compatible: JSON.stringify(results) and array indexing
  // (results[0], results.map(...)) all behave exactly as before, but a
  // caller that wants the richer data for instrumentation can read
  // results.performanceBreakdown / results.masteryBefore.
  results.performanceBreakdown = performanceBreakdown;
  results.masteryBefore = masteryBefore;

  return results;
}

/**
 * Public entry point. If the caller already has a transaction session open
 * (e.g. recordDurableAttempt, which writes the Attempt/LearningEvent/
 * Misconception docs and this mastery update as one atomic unit), reuse
 * it — nesting another transaction isn't needed or supported by the
 * driver. Otherwise open a short-lived transaction of our own so the two
 * callers that previously ran this with no session at all
 * (routes/learning.js: /tutor/respond and /attempts/evaluate) get the same
 * concurrency safety: MongoDB detects the write conflict between two
 * simultaneous callers touching the same StudentConcept doc and
 * `withTransaction` automatically retries the loser, so it recomputes
 * against the winner's committed state instead of clobbering it.
 */
export async function recordAttempt({
  userId,
  courseId,
  conceptIds,
  score,
  correct,
  confidence,
  difficulty = 3,
  responseTimeMs = null,
  misconceptionRisk = 0,
  session = null,
}) {
  const args = { userId, courseId, conceptIds, score, correct, confidence, difficulty, responseTimeMs, misconceptionRisk };

  if (session) {
    return recordAttemptInSession({ ...args, session });
  }

  const ownSession = await mongoose.startSession();
  try {
    let results;
    await ownSession.withTransaction(async () => {
      results = await recordAttemptInSession({ ...args, session: ownSession });
    });
    return results;
  } finally {
    await ownSession.endSession();
  }
}
