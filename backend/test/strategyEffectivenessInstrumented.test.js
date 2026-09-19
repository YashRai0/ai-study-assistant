import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStrategyEffectiveness, summarizeEffectivenessByMasteryBand } from "../src/services/strategyEffectiveness.js";

test("strategyEffectiveness: computes retentionOutcome and misconceptionFixRate", () => {
  const outcomes = [
    {
      strategy: "worked_example",
      outcome: "success",
      masteryDelta: 0.15,
      followUpCorrect: true,
      misconceptionBefore: "confuses_mitosis_meiosis",
      misconceptionAfter: null, // resolved!
    },
    {
      strategy: "worked_example",
      outcome: "success",
      masteryDelta: 0.20,
      followUpCorrect: false,
      misconceptionBefore: "confuses_mitosis_meiosis",
      misconceptionAfter: "confuses_mitosis_meiosis", // unresolved
    },
  ];

  const [summary] = summarizeStrategyEffectiveness(outcomes);
  assert.equal(summary.strategy, "worked_example");
  assert.equal(summary.analysisType, "observed_effectiveness");
  assert.equal(summary.retentionOutcome, 0.5); // 1 out of 2 followups correct
  assert.equal(summary.misconceptionFixRate, 0.5); // 1 out of 2 misconceptions resolved
});

test("strategyEffectiveness: summarizeEffectivenessByMasteryBand partitions correctly", () => {
  const outcomes = [
    { strategy: "analogical_scaffold", outcome: "success", masteryDelta: 0.3, beforeMastery: 0.15 },
    { strategy: "socratic_probe", outcome: "success", masteryDelta: 0.2, beforeMastery: 0.45 },
    { strategy: "speed_drill", outcome: "success", masteryDelta: 0.1, beforeMastery: 0.85 },
  ];

  const partitioned = summarizeEffectivenessByMasteryBand(outcomes);
  assert.equal(partitioned.lowMastery[0]?.strategy, "analogical_scaffold");
  assert.equal(partitioned.mediumMastery[0]?.strategy, "socratic_probe");
  assert.equal(partitioned.highMastery[0]?.strategy, "speed_drill");
});
