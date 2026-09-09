import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStrategyEffectiveness } from "../src/services/strategyEffectiveness.js";

test("empty outcomes list produces an empty summary", () => {
  assert.deepEqual(summarizeStrategyEffectiveness([]), []);
  assert.deepEqual(summarizeStrategyEffectiveness(undefined), []);
});

test("outcomes without a strategy (recorded before the field existed) are ignored", () => {
  const outcomes = [
    { strategy: null, outcome: "success", masteryDelta: 0.5 },
    { outcome: "failure", masteryDelta: -0.1 }, // no strategy key at all
  ];
  assert.deepEqual(summarizeStrategyEffectiveness(outcomes), []);
});

test("groups by strategy and computes success rate + average mastery delta", () => {
  const outcomes = [
    { strategy: "socratic_probe", outcome: "success", masteryDelta: 0.10 },
    { strategy: "socratic_probe", outcome: "success", masteryDelta: 0.20 },
    { strategy: "socratic_probe", outcome: "failure", masteryDelta: -0.05 },
    { strategy: "direct_instruction", outcome: "partial", masteryDelta: 0.30 },
  ];

  const summary = summarizeStrategyEffectiveness(outcomes);
  const socratic = summary.find((s) => s.strategy === "socratic_probe");
  const direct = summary.find((s) => s.strategy === "direct_instruction");

  assert.equal(socratic.attempts, 3);
  assert.ok(Math.abs(socratic.successRate - 2 / 3) < 1e-9);
  assert.ok(Math.abs(socratic.averageMasteryDelta - (0.10 + 0.20 - 0.05) / 3) < 1e-9);

  assert.equal(direct.attempts, 1);
  assert.equal(direct.successRate, 0); // "partial" doesn't count as success
  assert.equal(direct.averageMasteryDelta, 0.30);
});

test("ranks strategies by average mastery delta, not success rate", () => {
  // direct_instruction: always "success" but tiny mastery gain.
  // worked_example: never technically "success" (partial) but bigger gain.
  const outcomes = [
    { strategy: "direct_instruction", outcome: "success", masteryDelta: 0.02 },
    { strategy: "direct_instruction", outcome: "success", masteryDelta: 0.02 },
    { strategy: "worked_example", outcome: "partial", masteryDelta: 0.25 },
    { strategy: "worked_example", outcome: "partial", masteryDelta: 0.25 },
  ];

  const summary = summarizeStrategyEffectiveness(outcomes);
  assert.equal(summary[0].strategy, "worked_example");
  assert.equal(summary[1].strategy, "direct_instruction");
});

test("confidence reflects sample size, low/medium/high thresholds", () => {
  const makeOutcomes = (strategy, n) =>
    Array.from({ length: n }, () => ({ strategy, outcome: "success", masteryDelta: 0.1 }));

  const summary = summarizeStrategyEffectiveness([
    ...makeOutcomes("misconception_confrontation", 1),
    ...makeOutcomes("test_transfer", 5),
    ...makeOutcomes("worked_example", 12),
  ]);

  assert.equal(summary.find((s) => s.strategy === "misconception_confrontation").confidence, "low");
  assert.equal(summary.find((s) => s.strategy === "test_transfer").confidence, "medium");
  assert.equal(summary.find((s) => s.strategy === "worked_example").confidence, "high");
});
