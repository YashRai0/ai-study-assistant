// Adaptive tutor intervention engine.
//
// nextAction.js decides WHAT concept is worth working on next (coarse
// type: TEACH/REVIEW/TEST/MISCONCEPTION_FIX/PREREQUISITE_GAP). This module
// decides HOW to teach it once you're there — the specific pedagogical
// move — and, critically, ESCALATES that move within a session based on
// whether the previous move actually worked:
//
//   Student Model -> Tutor Decision -> Strategy -> Evaluate -> Student Model -> next Decision
//
// rather than picking a fresh strategy from scratch each time with no
// memory of what was already tried and failed in this session.

export const STRATEGIES = [
  "misconception_confrontation", // directly name and correct a specific wrong mental model
  "direct_instruction", // clear, structured explanation from the ground up
  "socratic_probe", // a guiding question, asking the student to construct the idea themselves
  "worked_example", // a fully worked example to model the reasoning
  "test_transfer", // a novel application/transfer question — they've earned harder practice
];

/**
 * Decides the next intervention strategy for one concept, given the
 * student's current state on it and what's already been tried THIS
 * session (empty on the first call for this concept).
 *
 * `priorInterventions`: [{ strategy, outcome }] in chronological order,
 * outcome one of "success" | "partial" | "failure" — mirrors
 * InterventionOutcome's schema so callers can pass that model's records
 * straight through.
 *
 * Pure function (no DB/LLM access) so the decision logic itself is
 * unit-testable independent of content generation.
 */
export function decideInterventionStrategy({ mastery = 0, misconceptionRisk = 0, priorInterventions = [] }) {
  const last = priorInterventions[priorInterventions.length - 1] || null;
  const lastFailed = last && last.outcome !== "success";

  // A live misconception takes priority over everything else — but only
  // confront it once per session. If confrontation already failed, the
  // student needs the foundation rebuilt, not the same correction repeated.
  if (misconceptionRisk >= 0.6) {
    const alreadyConfronted = priorInterventions.some((p) => p.strategy === "misconception_confrontation");
    if (!alreadyConfronted) {
      return { strategy: "misconception_confrontation", reason: "A specific misconception is likely present and hasn't been directly addressed yet this session." };
    }
    if (lastFailed) {
      return { strategy: "direct_instruction", reason: "Directly confronting the misconception didn't resolve it — rebuilding from the fundamentals instead of repeating the same correction." };
    }
  }

  if (mastery < 0.3) {
    return { strategy: "direct_instruction", reason: "Mastery is low enough that the student needs the concept taught from the ground up before anything else is productive." };
  }

  if (mastery < 0.6) {
    if (!last) {
      return { strategy: "socratic_probe", reason: "Moderate mastery — worth trying to have the student construct the idea themselves before explaining it outright." };
    }
    if (last.strategy === "socratic_probe" && lastFailed) {
      return { strategy: "worked_example", reason: "The student couldn't derive it themselves — showing a fully worked example instead of probing further." };
    }
    if (last.strategy === "worked_example" && lastFailed) {
      return { strategy: "direct_instruction", reason: "A worked example wasn't enough — falling back to the most explicit, structured explanation." };
    }
    if (lastFailed) {
      // Any other prior strategy that still failed at this mastery band —
      // don't loop on a strategy that isn't working.
      return { strategy: "direct_instruction", reason: "The previous approach didn't land — switching to direct instruction." };
    }
    return { strategy: "socratic_probe", reason: "Still building toward solid mastery — continuing to probe understanding." };
  }

  // mastery >= 0.6 and no live, unresolved misconception: they've earned
  // harder practice rather than more explanation.
  return { strategy: "test_transfer", reason: "Mastery is solid — worth testing whether it transfers to a novel situation rather than reviewing what's already understood." };
}
