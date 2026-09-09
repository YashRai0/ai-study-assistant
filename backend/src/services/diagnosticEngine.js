import { rankQuestions } from "./questionIntelligence.js";
import { targetLevelForMastery } from "./cognitiveLevel.js";

const DEFAULT_MAX_QUESTIONS = 12;
// A concept only gets re-probed with a second question if there's genuine
// signal ambiguity — otherwise one answered question per concept is
// treated as "enough" for a diagnostic (this isn't final mastery
// measurement, it's meant to find a reasonable starting point quickly).
const MAX_QUESTIONS_PER_CONCEPT = 2;

/**
 * Builds a running 0–1 confidence estimate per concept from the diagnostic
 * answers so far, starting from a neutral 0.5 prior for anything unprobed.
 * This is intentionally a simple running average, not the full mastery
 * model in mastery.js — a diagnostic needs a fast, cheap signal to decide
 * what to ask next, not a calibrated final score (that's what the real
 * StudentConcept mastery updates, driven by actual attempts after the
 * diagnostic, are for).
 */
function buildConceptEstimates(questions, answered) {
  const answeredByQuestionId = new Map(answered.map((a) => [String(a.questionId), a.correct]));
  const questionsById = new Map(questions.map((q) => [String(q._id), q]));

  const tally = new Map(); // conceptId -> { correct, total }
  for (const [questionId, correct] of answeredByQuestionId) {
    const question = questionsById.get(questionId);
    if (!question) continue; // answered a question no longer in the active bank
    for (const conceptId of question.conceptIds.map(String)) {
      const t = tally.get(conceptId) || { correct: 0, total: 0 };
      t.total += 1;
      if (correct) t.correct += 1;
      tally.set(conceptId, t);
    }
  }

  const estimates = new Map();
  for (const [conceptId, t] of tally) {
    estimates.set(conceptId, t.correct / t.total);
  }
  return { estimates, questionsById, answeredByQuestionId };
}

/**
 * A concept is ready to probe once every one of its prerequisites has
 * either been probed at least once in this diagnostic, or has none of its
 * own — mirrors nextAction.js's computePrerequisiteReadiness in spirit
 * (don't test something whose foundation is unknown yet), but simpler:
 * a diagnostic session is short, so "probed at all" is the right bar here,
 * not "mastered" — the goal is sequencing, not gating.
 */
function isReadyToProbe(concept, probedConceptIds) {
  const prereqIds = [...(concept.prerequisites || []), ...(concept.dependsOn || [])].map(String);
  return prereqIds.every((id) => probedConceptIds.has(id));
}

/**
 * Picks the single best next diagnostic question given everything
 * answered so far in this session — the core of making question 2 depend
 * on question 1, rather than serving a fixed pre-generated batch.
 *
 * Pure function (no DB access): concepts/questions/answered are all plain
 * data, so this is independently unit-testable and the route handler that
 * calls it just does the fetching and hands off to this.
 *
 * Returns { done: true } once the stopping criterion is met (max
 * questions reached, or nothing left worth asking), otherwise
 * { done: false, question, conceptId, reason }.
 */
export function selectNextDiagnosticQuestion({ concepts, questions, answered = [], maxQuestions = DEFAULT_MAX_QUESTIONS }) {
  if (answered.length >= maxQuestions) return { done: true, reason: "max_questions_reached" };
  if (!concepts.length || !questions.length) return { done: true, reason: "empty_bank" };

  const { estimates, questionsById, answeredByQuestionId } = buildConceptEstimates(questions, answered);
  const probedConceptIds = new Set(estimates.keys());

  const questionsByConceptId = new Map();
  for (const q of questions) {
    for (const conceptId of q.conceptIds.map(String)) {
      if (!questionsByConceptId.has(conceptId)) questionsByConceptId.set(conceptId, []);
      questionsByConceptId.get(conceptId).push(q);
    }
  }

  const conceptsById = new Map(concepts.map((c) => [String(c._id), c]));

  const candidates = concepts
    .map((concept) => {
      const conceptId = String(concept._id);
      const probedCount = probedConceptIds.has(conceptId)
        ? questions.filter((q) => q.conceptIds.map(String).includes(conceptId) && answeredByQuestionId.has(String(q._id))).length
        : 0;
      return {
        concept,
        conceptId,
        ready: isReadyToProbe(concept, probedConceptIds),
        probedCount,
        importance: concept.importance ?? 0.5,
      };
    })
    .filter((c) => c.ready && c.probedCount < MAX_QUESTIONS_PER_CONCEPT)
    .sort((a, b) => {
      // Prioritize completely-unprobed concepts over partially-probed
      // ones, then by importance — get broad coverage before depth.
      if (a.probedCount !== b.probedCount) return a.probedCount - b.probedCount;
      return b.importance - a.importance;
    });

  // Nothing is "ready" (e.g. every foundational concept already exhausted
  // its question bank, or a cyclic/unusual prerequisite graph) — fall back
  // to any under-probed concept regardless of prerequisite readiness
  // rather than stopping prematurely with an incomplete diagnostic. This
  // fallback pool is appended after the ready candidates (not used only
  // when candidates is empty) because a ready concept can still have zero
  // available questions, in which case the loop below needs somewhere
  // else to look rather than giving up.
  const fallbackPool = concepts
    .map((concept) => ({ concept, conceptId: String(concept._id), probedCount: 0, importance: concept.importance ?? 0.5 }))
    .filter((c) => {
      const answeredForConcept = questions.filter(
        (q) => q.conceptIds.map(String).includes(c.conceptId) && answeredByQuestionId.has(String(q._id))
      ).length;
      return answeredForConcept < MAX_QUESTIONS_PER_CONCEPT;
    })
    .sort((a, b) => b.importance - a.importance);

  const seen = new Set();
  const pool = [...candidates, ...fallbackPool].filter((c) => {
    if (seen.has(c.conceptId)) return false;
    seen.add(c.conceptId);
    return true;
  });

  for (const candidate of pool) {
    const available = (questionsByConceptId.get(candidate.conceptId) || []).filter(
      (q) => !answeredByQuestionId.has(String(q._id))
    );
    if (!available.length) continue; // question bank exhausted for this concept, try the next candidate

    const estimate = estimates.get(candidate.conceptId) ?? 0.5;
    const targetLevel = targetLevelForMastery(estimate);
    // Same scoring engine adaptiveRuntime.js's findQuestionForConcept uses
    // for regular practice — a diagnostic benefits from the same
    // calibrated-difficulty/uncertainty/novelty signals, just with an
    // explicit targetCognitiveLevel (this function's own per-concept
    // estimate-driven target) rather than letting rankQuestions derive it
    // fresh from mastery alone, and a "DIAGNOSTIC" actionType on a
    // concept's first probe so difficulty targeting doesn't assume this is
    // routine practice.
    const ranked = rankQuestions({
      questions: available,
      mastery: estimate,
      targetCognitiveLevel: targetLevel,
      actionType: candidate.probedCount === 0 ? "DIAGNOSTIC" : "PRACTICE",
      recentQuestionIds: new Set(answeredByQuestionId.keys()),
    });
    const question = ranked[0]?.question || null;
    if (!question) continue;

    return {
      done: false,
      question,
      conceptId: candidate.conceptId,
      conceptName: conceptsById.get(candidate.conceptId)?.name,
      reason: candidate.probedCount === 0 ? "unprobed_concept" : "refining_estimate",
    };
  }

  return { done: true, reason: "question_bank_exhausted" };
}
