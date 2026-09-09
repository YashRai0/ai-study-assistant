import test from "node:test";
import assert from "node:assert/strict";
import { computePrerequisiteReadiness } from "../src/services/nextAction.js";

test("returns 1 (fully ready) when a concept has no prerequisites at all", () => {
  const concept = { prerequisites: [], dependsOn: [] };
  assert.equal(computePrerequisiteReadiness(concept, new Map()), 1);
});

test("returns 0 when every prerequisite is completely unstudied", () => {
  const concept = { prerequisites: ["a", "b"], dependsOn: [] };
  const masteryByConceptId = new Map(); // nothing tracked — 0 mastery
  assert.equal(computePrerequisiteReadiness(concept, masteryByConceptId), 0);
});

test("returns the average mastery across prerequisites", () => {
  const concept = { prerequisites: ["a", "b"], dependsOn: [] };
  const masteryByConceptId = new Map([["a", 1], ["b", 0]]);
  assert.equal(computePrerequisiteReadiness(concept, masteryByConceptId), 0.5);
});

test("dependsOn counts double weight relative to prerequisites", () => {
  // one fully-mastered prerequisite (weight 1) + one zero-mastery dependsOn
  // (weight 2) => weighted average = (1*1 + 0*2) / 3 = 1/3
  const concept = { prerequisites: ["a"], dependsOn: ["b"] };
  const masteryByConceptId = new Map([["a", 1], ["b", 0]]);
  assert.equal(computePrerequisiteReadiness(concept, masteryByConceptId), 1 / 3);
});

test("an untracked prerequisite counts as zero mastery, not skipped", () => {
  const concept = { prerequisites: ["a", "untracked-id"], dependsOn: [] };
  const masteryByConceptId = new Map([["a", 1]]); // "untracked-id" absent
  assert.equal(computePrerequisiteReadiness(concept, masteryByConceptId), 0.5);
});

test("handles missing prerequisites/dependsOn fields gracefully", () => {
  assert.equal(computePrerequisiteReadiness({}, new Map()), 1);
});
