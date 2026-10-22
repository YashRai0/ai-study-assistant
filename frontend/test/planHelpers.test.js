import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePlanProgress,
  calculateRemainingMinutes,
  partitionPlans,
} from "../src/utils/planHelpers.js";

test("calculatePlanProgress computes percentage correctly", () => {
  assert.equal(calculatePlanProgress([]), 0);
  assert.equal(calculatePlanProgress([{ completed: true }, { completed: false }]), 50);
  assert.equal(calculatePlanProgress([{ completed: true }, { completed: true }, { completed: true }]), 100);
});

test("calculateRemainingMinutes sums only uncompleted days", () => {
  const days = [
    { completed: true, estimatedMinutes: 45 },
    { completed: false, estimatedMinutes: 30 },
    { completed: false, estimatedMinutes: 60 },
  ];
  assert.equal(calculateRemainingMinutes(days), 90);
});

test("partitionPlans splits active and finished plans", () => {
  const plans = [
    { id: "1", totalDays: 5, completedDays: 5 },
    { id: "2", totalDays: 7, completedDays: 2 },
  ];
  const { active, completed } = partitionPlans(plans);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "2");
  assert.equal(completed.length, 1);
  assert.equal(completed[0].id, "1");
});
