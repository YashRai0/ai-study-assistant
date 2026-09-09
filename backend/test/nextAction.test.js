import test from "node:test";
import assert from "node:assert/strict";
import { weakestPrerequisite } from "../src/services/nextAction.js";

function concept(id, { prerequisites = [], dependsOn = [], name } = {}) {
  return { _id: id, name: name || id, prerequisites, dependsOn };
}

test("returns the weakest of several prerequisites, not just the first listed", () => {
  const strong = concept("strong");
  const weak = concept("weak");
  const target = concept("target", { prerequisites: ["strong", "weak"] });
  const masteryByConceptId = new Map([["strong", 0.9], ["weak", 0.2]]);
  const conceptsById = new Map([["strong", strong], ["weak", weak], ["target", target]]);

  const result = weakestPrerequisite(target, masteryByConceptId, conceptsById);

  assert.equal(result.concept._id, "weak");
  assert.equal(result.mastery, 0.2);
});

test("dependsOn concepts are considered alongside prerequisites", () => {
  const prereq = concept("prereq");
  const dependency = concept("dependency");
  const target = concept("target", { prerequisites: ["prereq"], dependsOn: ["dependency"] });
  const masteryByConceptId = new Map([["prereq", 0.6], ["dependency", 0.1]]);
  const conceptsById = new Map([["prereq", prereq], ["dependency", dependency], ["target", target]]);

  const result = weakestPrerequisite(target, masteryByConceptId, conceptsById);

  assert.equal(result.concept._id, "dependency");
});

test("a dangling prerequisite reference (concept doc no longer exists) is skipped, not crashed on", () => {
  const real = concept("real");
  const target = concept("target", { prerequisites: ["deleted-concept-id", "real"] });
  const masteryByConceptId = new Map([["real", 0.4]]);
  const conceptsById = new Map([["real", real]]); // "deleted-concept-id" intentionally absent

  const result = weakestPrerequisite(target, masteryByConceptId, conceptsById);

  assert.equal(result.concept._id, "real");
});

test("no prerequisites at all returns null rather than throwing", () => {
  const target = concept("target");
  const result = weakestPrerequisite(target, new Map(), new Map());
  assert.equal(result, null);
});

test("an untracked prerequisite (no StudentConcept yet) counts as 0 mastery, so it's picked over a partially-tracked one", () => {
  const untracked = concept("untracked");
  const partial = concept("partial");
  const target = concept("target", { prerequisites: ["untracked", "partial"] });
  const masteryByConceptId = new Map([["partial", 0.3]]); // "untracked" has no entry at all
  const conceptsById = new Map([["untracked", untracked], ["partial", partial]]);

  const result = weakestPrerequisite(target, masteryByConceptId, conceptsById);

  assert.equal(result.concept._id, "untracked");
  assert.equal(result.mastery, 0);
});
