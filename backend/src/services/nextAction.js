import Course from "../models/Course.js";
import Concept from "../models/Concept.js";
import StudentConcept from "../models/StudentConcept.js";
import Misconception from "../models/Misconception.js";
import Attempt from "../models/Attempt.js";
import { calculateForgettingRisk } from "./mastery.js";
import { retentionFraction } from "./masteryWithEbbinghaus.js";
import { explainNextBestAction } from "./adaptiveExplanation.js";

function clamp(v) { return Math.max(0, Math.min(1, Number(v) || 0)); }

function daysUntil(date) {
  if (!date) return 30;
  return Math.max(0, (new Date(date).getTime() - Date.now()) / 864e5);
}

/**
 * How ready a student is to productively study `concept`, based on their
 * mastery of its prerequisites and dependsOn concepts (dependsOn is a
 * stricter, "definition requires this" relationship, so it counts double).
 * Returns 1 (fully ready) when there are no tracked prerequisites at all —
 * an untracked concept shouldn't be penalized for a gap we can't see.
 *
 * Pulled out as a pure function (no DB access) so it's unit-testable
 * without a live Mongo connection.
 */
export function computePrerequisiteReadiness(concept, masteryByConceptId) {
  const prereqIds = Array.isArray(concept.prerequisites) ? concept.prerequisites : [];
  const dependsOnIds = Array.isArray(concept.dependsOn) ? concept.dependsOn : [];
  const weighted = [
    ...prereqIds.map((id) => ({ id, weight: 1 })),
    ...dependsOnIds.map((id) => ({ id, weight: 2 })),
  ];
  if (!weighted.length) return 1;

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const weightedMastery = weighted.reduce((sum, w) => {
    // An untracked/unstudied prerequisite counts as 0 mastery (not
    // "ready") — the absence of data isn't evidence the student knows it.
    const mastery = clamp(masteryByConceptId.get(String(w.id)));
    return sum + mastery * w.weight;
  }, 0);

  return weightedMastery / totalWeight;
}

/**
 * Of a concept's prerequisites and dependsOn concepts, which one is the
 * weakest — i.e. which one to actually recommend studying when `concept`
 * itself is blocked on a shaky foundation (see rankConcepts'
 * blockedByPrerequisite). Returns null if none of them resolve to a real
 * Concept document (a dangling reference) or the concept has none.
 */
export function weakestPrerequisite(concept, masteryByConceptId, conceptsById) {
  const ids = [...(concept.prerequisites || []), ...(concept.dependsOn || [])].map(String);
  const candidates = ids
    .map((id) => ({ concept: conceptsById.get(id), mastery: clamp(masteryByConceptId.get(id)) }))
    .filter((x) => x.concept);
  return candidates.sort((a, b) => a.mastery - b.mastery)[0] || null;
}

/**
 * Shared ranking logic: scores and sorts every concept in a course by how
 * valuable it is to study right now, given this student's mastery,
 * forgetting risk, misconceptions, and the course's importance/exam-date
 * weighting. Both getNextAction (single best action) and
 * buildStudySessionPlan (a full multi-concept session) are built on this,
 * so the two can't drift into disagreeing about what's worth studying.
 */
export async function rankConcepts({ userId, courseId }) {
  const course = await Course.findOne({ _id: courseId, owner: userId }).lean();
  if (!course) return null;

  const concepts = await Concept.find({ course: courseId }).lean();
  if (!concepts.length) return { course, ranked: [] };

  const conceptsById = new Map(concepts.map((c) => [String(c._id), c]));
  const states = await StudentConcept.find({ user: userId, course: courseId }).lean();
  const stateByConcept = new Map(states.map((s) => [String(s.concept), s]));
  const misconceptions = await Misconception.find({ user: userId, course: courseId, resolved: false }).lean();
  const misByConcept = new Map();
  for (const m of misconceptions) misByConcept.set(String(m.concept), Math.max(misByConcept.get(String(m.concept)) || 0, m.severity === "high" ? 1 : m.severity === "medium" ? 0.7 : 0.4));

  const urgency = clamp(1 - daysUntil(course.examDate) / 30);
  const masteryByConceptId = new Map(concepts.map((c) => [String(c._id), (stateByConcept.get(String(c._id)) || {}).mastery]));
  const ranked = concepts.map((concept) => {
    const state = stateByConcept.get(String(concept._id)) || {};
    const mastery = clamp(state.mastery);
    const weakness = 1 - mastery;
    const importance = clamp(concept.importance ?? 0.5);
    // Computed live from elapsed time since the last review, not read
    // from the stored StudentConcept.forgettingRisk field — that field is
    // only ever written at attempt-recording time (see recordAttempt in
    // mastery.js), always as of "right now", so it goes stale the moment
    // time passes without a new attempt. A concept the student hasn't
    // touched in three weeks should show real forgetting risk even though
    // nothing has re-written its stored value since then.
    const forgetting = clamp(calculateForgettingRisk(state.lastReviewedAt, mastery));
    const misconception = Math.max(clamp(state.misconceptionRisk), misByConcept.get(String(concept._id)) || 0);
    const reviewDue = state.nextReviewAt && new Date(state.nextReviewAt) <= new Date() ? 1 : 0;
    // An overconfident concept (sure of themselves, often wrong) is a real
    // exam-day risk precisely because it doesn't look weak on mastery alone —
    // the student isn't asking for help on it. Give it a modest nudge, not a
    // dominant one: it's a warning sign, not the same thing as low mastery.
    const overconfidence = state.calibration < -0.3 ? Math.min(1, -state.calibration) : 0;
    const prerequisiteReadiness = computePrerequisiteReadiness(concept, masteryByConceptId);
    let priority = weakness * 0.33 + importance * 0.18 + urgency * importance * 0.15 + forgetting * 0.1 + misconception * 0.14 + reviewDue * 0.05 + overconfidence * 0.05;
    // Teaching a concept whose prerequisites aren't solid yet is usually
    // wasted effort — the student can't build on a foundation that isn't
    // there. Only gate concepts that are ALSO still weak themselves: if a
    // student already has decent mastery despite a shaky-looking
    // prerequisite (they may have learned it a different way, or our
    // tracking is incomplete), don't second-guess that with a penalty.
    const blockedByPrerequisite = prerequisiteReadiness < 0.5 && mastery < 0.5;
    if (blockedByPrerequisite) priority *= 0.4;

    let type = "PRACTICE";
    if (misconception >= 0.7) type = "MISCONCEPTION_FIX";
    else if (blockedByPrerequisite) type = "PREREQUISITE_GAP";
    else if (mastery < 0.4) type = "TEACH";
    else if (reviewDue || forgetting >= 0.7) type = "REVIEW";
    else if (overconfidence >= 0.3 && mastery >= 0.4) type = "TEST";
    else if (daysUntil(course.examDate) < 7 && importance >= 0.8 && mastery >= 0.6) type = "TEST";
    const prerequisite = blockedByPrerequisite
      ? weakestPrerequisite(concept, masteryByConceptId, conceptsById)
      : null;
    return {
      concept, state, type, priority, mastery, misconception, overconfidence,
      prerequisiteReadiness, blockedByPrerequisite, prerequisite, reviewDue: Boolean(reviewDue),
      urgency, importance,
    };
  }).sort((a, b) => b.priority - a.priority);

  return { course, ranked, stateByConcept };
}

export async function getNextAction({ userId, courseId }) {
  const result = await rankConcepts({ userId, courseId });
  if (!result) return null;
  if (!result.ranked.length) {
    return { type: "DIAGNOSTIC", reason: "No concepts have been added yet.", estimatedMinutes: 5 };
  }

  const best = result.ranked[0];
  // For PREREQUISITE_GAP, `concept` (what to actually study/get a
  // question about next) must be the weak prerequisite itself, not the
  // blocked concept the ranking was scoring — the whole point of this
  // action type is "don't practice X yet, it's built on Y which isn't
  // solid". Returning `best.concept` here would recommend the very thing
  // the reason text says to hold off on. `targetConcept` keeps the
  // original around for context (e.g. "strengthening this unlocks X").
  const recommendedConcept = best.type === "PREREQUISITE_GAP" && best.prerequisite
    ? { id: best.prerequisite.concept._id, name: best.prerequisite.concept.name, mastery: best.prerequisite.mastery }
    : { id: best.concept._id, name: best.concept.name, mastery: best.mastery };

  // Recomputed live from mastery + elapsed time rather than trusting the
  // recommended concept's stored StudentConcept.retention field directly
  // — same principle (and same trap) as adaptiveRuntime.js's
  // readinessForConcept fix.
  const recommendedState = result.stateByConcept.get(String(recommendedConcept.id));
  const ageDays = recommendedState?.lastReviewedAt
    ? Math.max(0, (Date.now() - new Date(recommendedState.lastReviewedAt).getTime()) / 864e5)
    : 30;
  const retention = retentionFraction(clamp(recommendedConcept.mastery), ageDays);

  // Last 5 attempts specifically on the recommended concept — only
  // queried for the single winning recommendation, not every ranked
  // concept, to avoid an N+1 query across the whole course.
  const recentAttempts = await Attempt.find({ user: userId, course: courseId, conceptIds: recommendedConcept.id })
    .select("correct").sort({ createdAt: -1 }).limit(5).lean();
  const recentFailureCount = recentAttempts.filter((a) => !a.correct).length;

  const explanation = explainNextBestAction({
    conceptName: recommendedConcept.name,
    mastery: recommendedConcept.mastery,
    retention,
    misconceptionRisk: best.misconception,
    prerequisiteBlocked: best.type === "PREREQUISITE_GAP",
    prerequisiteName: best.type === "PREREQUISITE_GAP" && best.prerequisite?.concept?.name ? best.prerequisite.concept.name : null,
    dueForReview: best.reviewDue,
    recentFailureCount,
    examImportance: best.importance,
    examUrgency: best.urgency,
  });

  return {
    type: best.type,
    concept: recommendedConcept,
    targetConcept: { id: best.concept._id, name: best.concept.name, mastery: best.mastery },
    reason: best.type === "MISCONCEPTION_FIX"
      ? "You have repeated evidence of a misconception here."
      : best.type === "PREREQUISITE_GAP"
        ? "This builds on a concept you haven't mastered yet — worth strengthening that first."
        : best.type === "TEACH"
          ? "This is currently one of your weakest important concepts."
          : best.type === "REVIEW"
            ? "This concept is due for review or at risk of being forgotten."
            : best.type === "TEST" && best.overconfidence >= 0.3
              ? "You've been confident on this one but often wrong — worth testing before you trust it."
              : "This is the highest-value next practice target.",
    // Multi-bullet "why this?" breakdown alongside the single-sentence
    // `reason` above (kept unchanged for existing callers) — see
    // adaptiveExplanation.js. reasons is the itemized list, summary is
    // reasons joined into one string for anything that just wants text.
    reasons: explanation.reasons,
    explanationSummary: explanation.summary,
    estimatedMinutes: best.type === "MISCONCEPTION_FIX" ? 12 : best.type === "TEACH" ? 15 : 10,
  };
}
