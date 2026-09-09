import test from "node:test";
import assert from "node:assert/strict";
import { resolveConceptRelationships } from "../src/services/learningPipeline.js";

function fakeId(n) {
  // 24-char hex, matches ObjectId's string shape closely enough for these
  // tests (they only compare String(id) equality, never touch Mongoose).
  return n.toString().padStart(24, "0");
}

test("resolves relationship names to ids across all six relationship types", () => {
  const glucoseId = fakeId(1);
  const pyruvateId = fakeId(2);
  const krebsId = fakeId(3);

  const conceptsByName = new Map([
    ["glucose metabolism", { _id: glucoseId }],
    ["pyruvate oxidation", { _id: pyruvateId }],
    ["krebs cycle", { _id: krebsId }],
  ]);

  const item = {
    name: "Glycolysis",
    prerequisites: ["Glucose Metabolism"],
    relatedConcepts: ["Krebs Cycle"],
    dependsOn: ["Pyruvate Oxidation"],
    supports: ["Krebs Cycle"],
    contrastsWith: [],
    commonlyConfusedWith: [],
  };

  const resolved = resolveConceptRelationships(item, conceptsByName, fakeId(4));

  assert.deepEqual(resolved.prerequisites, [glucoseId]);
  assert.deepEqual(resolved.relatedConcepts, [krebsId]);
  assert.deepEqual(resolved.dependsOn, [pyruvateId]);
  assert.deepEqual(resolved.supports, [krebsId]);
  assert.deepEqual(resolved.contrastsWith, []);
  assert.deepEqual(resolved.commonlyConfusedWith, []);
});

test("drops names that don't match any known concept", () => {
  const conceptsByName = new Map([["glucose metabolism", { _id: fakeId(1) }]]);
  const item = { name: "Glycolysis", prerequisites: ["Glucose Metabolism", "Some Unextracted Concept"] };

  const resolved = resolveConceptRelationships(item, conceptsByName, fakeId(4));

  assert.deepEqual(resolved.prerequisites, [fakeId(1)]);
});

test("drops a self-reference", () => {
  const selfId = fakeId(1);
  const conceptsByName = new Map([["glycolysis", { _id: selfId }]]);
  const item = { name: "Glycolysis", prerequisites: ["Glycolysis"] };

  const resolved = resolveConceptRelationships(item, conceptsByName, selfId);

  assert.deepEqual(resolved.prerequisites, []);
});

test("missing relationship fields on the item default to empty arrays, not undefined", () => {
  const conceptsByName = new Map([["glycolysis", { _id: fakeId(1) }]]);
  const item = { name: "Glycolysis" }; // no relationship fields at all

  const resolved = resolveConceptRelationships(item, conceptsByName, fakeId(4));

  for (const field of ["prerequisites", "relatedConcepts", "dependsOn", "supports", "contrastsWith", "commonlyConfusedWith"]) {
    assert.deepEqual(resolved[field], []);
  }
});

test("name matching is case- and whitespace-insensitive", () => {
  const conceptsByName = new Map([["glucose metabolism", { _id: fakeId(1) }]]);
  const item = { name: "Glycolysis", prerequisites: ["  GLUCOSE   metabolism  "] };

  const resolved = resolveConceptRelationships(item, conceptsByName, fakeId(4));

  assert.deepEqual(resolved.prerequisites, [fakeId(1)]);
});
