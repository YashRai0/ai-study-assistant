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

export function confidenceFor(attempts) {
  if (attempts >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (attempts >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function summarizeStrategyEffectiveness(outcomes) {
  const byStrategy = new Map();

  for (const o of outcomes || []) {
    if (!o.strategy) continue; // outcomes recorded before this field existed
    if (!byStrategy.has(o.strategy)) {
      byStrategy.set(o.strategy, {
        strategy: o.strategy,
        attempts: 0,
        successCount: 0,
        totalMasteryDelta: 0,
        followUpCorrectCount: 0,
        followUpCount: 0,
        misconceptionResolvedCount: 0,
        misconceptionCount: 0,
      });
    }
    const bucket = byStrategy.get(o.strategy);
    bucket.attempts += 1;
    if (o.outcome === "success") bucket.successCount += 1;
    bucket.totalMasteryDelta += Number(o.masteryDelta) || 0;

    if (o.followUpCorrect !== null && o.followUpCorrect !== undefined) {
      bucket.followUpCount += 1;
      if (o.followUpCorrect) bucket.followUpCorrectCount += 1;
    }

    if (o.misconceptionBefore) {
      bucket.misconceptionCount += 1;
      if (!o.misconceptionAfter || o.misconceptionAfter !== o.misconceptionBefore) {
        bucket.misconceptionResolvedCount += 1;
      }
    }
  }

  return Array.from(byStrategy.values())
    .map((b) => ({
      strategy: b.strategy,
      attempts: b.attempts,
      successRate: b.attempts ? b.successCount / b.attempts : 0,
      averageMasteryDelta: b.attempts ? b.totalMasteryDelta / b.attempts : 0,
      retentionOutcome: b.followUpCount ? b.followUpCorrectCount / b.followUpCount : null,
      misconceptionFixRate: b.misconceptionCount ? b.misconceptionResolvedCount / b.misconceptionCount : null,
      // Sample size thresholds: <3 low, 3-9 medium, 10+ high (Step 12)
      confidence: confidenceFor(b.attempts),
      analysisType: "observed_effectiveness", // Explicit: observational, not causal (Step 11)
    }))
    // Ranked by mastery delta rather than success rate: a strategy that
    // usually gets a "partial" but still moves mastery up meaningfully is
    // more useful than one that racks up cheap "success" outcomes on
    // easy follow-ups without much mastery gain.
    .sort((a, b) => b.averageMasteryDelta - a.averageMasteryDelta);
}

/**
 * Summarizes observed effectiveness across mastery bands (low <0.3, mid 0.3-0.6, high >=0.6).
 * Answers which strategy works best for which mastery band (Step 11 & Step 12).
 */
export function summarizeEffectivenessByMasteryBand(outcomes) {
  const bands = {
    low: [], // < 0.3
    medium: [], // 0.3 <= mastery < 0.6
    high: [], // >= 0.6
  };

  for (const o of outcomes || []) {
    const m = Number(o.beforeMastery ?? o.masteryBefore);
    if (!Number.isFinite(m)) continue;
    if (m < 0.3) bands.low.push(o);
    else if (m < 0.6) bands.medium.push(o);
    else bands.high.push(o);
  }

  return {
    lowMastery: summarizeStrategyEffectiveness(bands.low),
    mediumMastery: summarizeStrategyEffectiveness(bands.medium),
    highMastery: summarizeStrategyEffectiveness(bands.high),
  };
}
