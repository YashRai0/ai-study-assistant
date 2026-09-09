// Turns a list of InterventionOutcome documents into a per-strategy
// summary — the actual answer to "which teaching strategy works best for
// this student" that TutorInteraction/InterventionOutcome existing side
// by side was supposed to eventually support (TutorInteraction records
// what the engine attempted, InterventionOutcome records what happened
// afterward; this is the first thing that actually joins them by
// strategy rather than just the coarser interventionType bucket).
//
// Pure function, no DB access, so it's independently testable — see
// test/strategyEffectiveness.test.js.

const CONFIDENCE_THRESHOLDS = { high: 10, medium: 3 };

function confidenceFor(attempts) {
  if (attempts >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (attempts >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function summarizeStrategyEffectiveness(outcomes) {
  const byStrategy = new Map();

  for (const o of outcomes || []) {
    if (!o.strategy) continue; // outcomes recorded before this field existed
    if (!byStrategy.has(o.strategy)) {
      byStrategy.set(o.strategy, { strategy: o.strategy, attempts: 0, successCount: 0, totalMasteryDelta: 0 });
    }
    const bucket = byStrategy.get(o.strategy);
    bucket.attempts += 1;
    if (o.outcome === "success") bucket.successCount += 1;
    bucket.totalMasteryDelta += Number(o.masteryDelta) || 0;
  }

  return Array.from(byStrategy.values())
    .map((b) => ({
      strategy: b.strategy,
      attempts: b.attempts,
      successRate: b.attempts ? b.successCount / b.attempts : 0,
      averageMasteryDelta: b.attempts ? b.totalMasteryDelta / b.attempts : 0,
      // Low-sample strategies can look artificially great or terrible off
      // one or two attempts — surfaced so a caller can gray these out or
      // ask for more data instead of confidently recommending "always use
      // socratic_probe" from n=1.
      confidence: confidenceFor(b.attempts),
    }))
    // Ranked by mastery delta rather than success rate: a strategy that
    // usually gets a "partial" but still moves mastery up meaningfully is
    // more useful than one that racks up cheap "success" outcomes on
    // easy follow-ups without much mastery gain.
    .sort((a, b) => b.averageMasteryDelta - a.averageMasteryDelta);
}
