import { rankConcepts } from "./nextAction.js";

/**
 * Builds a time-boxed, multi-phase study session plan for a course.
 *
 * Deliberately deterministic, not LLM-generated: which concepts to study
 * and how long to spend on each is a scheduling decision, not a content
 * decision, so it's computed from the same priority ranking that powers
 * getNextAction. The LLM's job stays scoped to explaining/evaluating
 * individual answers (see evaluateFreeResponse, evaluateQuestionAnswer) —
 * not to deciding what the student should study.
 */
const PHASE_SHARE = {
  warmup: 0.12,
  teach: 0.35,
  practice: 0.28,
  misconception_fix: 0.15,
  recall: 0.10,
};

function minutesFor(share, total) {
  return Math.max(1, Math.round(share * total));
}

export async function buildStudySessionPlan({ userId, courseId, minutes }) {
  const result = await rankConcepts({ userId, courseId });
  if (!result) return null;
  const { course, ranked } = result;

  if (!ranked.length) {
    return { course: { id: course._id, title: course.title }, totalMinutes: minutes, phases: [] };
  }

  const misconceptionConcept = ranked.find((c) => c.misconception >= 0.7);
  const teachConcept = ranked[0];
  const practiceConcept = ranked.find((c) => c.concept._id !== teachConcept.concept._id) || teachConcept;
  // Warm-up on the strongest concept the student has some history with — cheap
  // retrieval practice to get started, not the hardest thing they'll face.
  const warmupConcept = ranked.slice().sort((a, b) => b.mastery - a.mastery)[0];

  const includeMisconceptionFix = Boolean(misconceptionConcept);
  const shares = { ...PHASE_SHARE };
  if (!includeMisconceptionFix) {
    // Redistribute that slice into teach/practice rather than leaving it unused.
    shares.teach += shares.misconception_fix * 0.6;
    shares.practice += shares.misconception_fix * 0.4;
    shares.misconception_fix = 0;
  }

  const phases = [];
  let used = 0;

  function pushPhase(key, type, entry, label) {
    if (!entry) return;
    const m = minutesFor(shares[key], minutes);
    used += m;
    phases.push({
      phase: key,
      type,
      label,
      minutes: m,
      conceptId: entry.concept._id,
      conceptName: entry.concept.name,
      masteryBefore: entry.mastery,
    });
  }

  pushPhase("warmup", "REVIEW", warmupConcept, "Warm-up: retrieval practice");
  pushPhase(
    "teach",
    teachConcept.type,
    teachConcept,
    teachConcept.type === "TEACH"
      ? "Learn a weak concept"
      : teachConcept.type === "PREREQUISITE_GAP"
        ? "Strengthen a foundational concept first"
        : "Deep practice"
  );
  pushPhase("practice", "PRACTICE", practiceConcept, "Adaptive practice");
  if (includeMisconceptionFix) {
    pushPhase("misconception_fix", "MISCONCEPTION_FIX", misconceptionConcept, "Fix a misconception");
  }
  pushPhase("recall", "REVIEW", teachConcept, "Final recall check");

  // Fold any leftover/overshoot minutes (from rounding) into the last phase
  // so the displayed total always matches what the student asked for.
  if (phases.length) {
    phases[phases.length - 1].minutes += minutes - used;
    phases[phases.length - 1].minutes = Math.max(1, phases[phases.length - 1].minutes);
  }

  return { course: { id: course._id, title: course.title }, totalMinutes: minutes, phases };
}
