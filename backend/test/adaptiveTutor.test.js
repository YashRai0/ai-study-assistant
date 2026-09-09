import test from "node:test";
import assert from "node:assert/strict";
import { decideInterventionStrategy, STRATEGIES } from "../src/services/adaptiveTutor.js";

test("a live misconception is confronted first, before anything else", () => {
  const { strategy } = decideInterventionStrategy({ mastery: 0.8, misconceptionRisk: 0.7, priorInterventions: [] });
  assert.equal(strategy, "misconception_confrontation");
});

test("misconception confrontation is not repeated twice in the same session", () => {
  const { strategy } = decideInterventionStrategy({
    mastery: 0.8,
    misconceptionRisk: 0.7,
    priorInterventions: [{ strategy: "misconception_confrontation", outcome: "success" }],
  });
  assert.notEqual(strategy, "misconception_confrontation");
});

test("a failed misconception confrontation escalates to direct instruction, not a repeat", () => {
  const { strategy, reason } = decideInterventionStrategy({
    mastery: 0.8,
    misconceptionRisk: 0.7,
    priorInterventions: [{ strategy: "misconception_confrontation", outcome: "failure" }],
  });
  assert.equal(strategy, "direct_instruction");
  assert.match(reason, /rebuilding|fundamentals/i);
});

test("very low mastery always gets direct instruction regardless of history", () => {
  const { strategy } = decideInterventionStrategy({ mastery: 0.1, misconceptionRisk: 0, priorInterventions: [] });
  assert.equal(strategy, "direct_instruction");
});

test("moderate mastery with no history starts with a Socratic probe", () => {
  const { strategy } = decideInterventionStrategy({ mastery: 0.5, misconceptionRisk: 0, priorInterventions: [] });
  assert.equal(strategy, "socratic_probe");
});

test("a failed Socratic probe escalates to a worked example, not a repeated probe", () => {
  const { strategy } = decideInterventionStrategy({
    mastery: 0.5,
    misconceptionRisk: 0,
    priorInterventions: [{ strategy: "socratic_probe", outcome: "failure" }],
  });
  assert.equal(strategy, "worked_example");
});

test("a failed worked example escalates to direct instruction as the final fallback", () => {
  const { strategy } = decideInterventionStrategy({
    mastery: 0.5,
    misconceptionRisk: 0,
    priorInterventions: [
      { strategy: "socratic_probe", outcome: "failure" },
      { strategy: "worked_example", outcome: "failure" },
    ],
  });
  assert.equal(strategy, "direct_instruction");
});

test("a successful Socratic probe continues probing rather than escalating unnecessarily", () => {
  const { strategy } = decideInterventionStrategy({
    mastery: 0.55,
    misconceptionRisk: 0,
    priorInterventions: [{ strategy: "socratic_probe", outcome: "success" }],
  });
  assert.equal(strategy, "socratic_probe");
});

test("high mastery with no misconception moves to transfer testing, not more teaching", () => {
  const { strategy } = decideInterventionStrategy({ mastery: 0.85, misconceptionRisk: 0.1, priorInterventions: [] });
  assert.equal(strategy, "test_transfer");
});

test("every returned strategy is one of the declared STRATEGIES", () => {
  const scenarios = [
    { mastery: 0, misconceptionRisk: 0, priorInterventions: [] },
    { mastery: 0.9, misconceptionRisk: 0.9, priorInterventions: [] },
    { mastery: 0.5, misconceptionRisk: 0, priorInterventions: [{ strategy: "worked_example", outcome: "partial" }] },
  ];
  for (const s of scenarios) {
    const { strategy } = decideInterventionStrategy(s);
    assert.ok(STRATEGIES.includes(strategy), `${strategy} should be a declared strategy`);
  }
});

test("handles missing/default arguments gracefully", () => {
  const { strategy } = decideInterventionStrategy({});
  assert.ok(STRATEGIES.includes(strategy));
});
