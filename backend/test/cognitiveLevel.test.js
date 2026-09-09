import test from "node:test";
import assert from "node:assert/strict";
import { targetLevelForMastery, pickClosestLevel, isValidLevel, LEVELS } from "../src/services/cognitiveLevel.js";

test("low mastery targets recognition, high mastery targets transfer", () => {
  assert.equal(targetLevelForMastery(0), "recognition");
  assert.equal(targetLevelForMastery(0.5), "application");
  assert.equal(targetLevelForMastery(1), "transfer");
});

test("target level is monotonic with mastery", () => {
  const levels = [0, 0.2, 0.4, 0.6, 0.8, 1].map(targetLevelForMastery);
  const indices = levels.map((l) => LEVELS.indexOf(l));
  for (let i = 1; i < indices.length; i++) {
    assert.ok(indices[i] >= indices[i - 1]);
  }
});

test("pickClosestLevel returns an exact match when available", () => {
  const questions = [
    { cognitiveLevel: "recall", difficulty: 2, createdAt: "2024-01-01" },
    { cognitiveLevel: "application", difficulty: 3, createdAt: "2024-01-01" },
    { cognitiveLevel: "transfer", difficulty: 5, createdAt: "2024-01-01" },
  ];
  const picked = pickClosestLevel(questions, "application");
  assert.equal(picked.cognitiveLevel, "application");
});

test("pickClosestLevel falls back to the nearest level when there's no exact match", () => {
  const questions = [
    { cognitiveLevel: "recognition", difficulty: 1, createdAt: "2024-01-01" },
    { cognitiveLevel: "transfer", difficulty: 5, createdAt: "2024-01-01" },
  ];
  // Target "analysis" (index 3) is closer to "transfer" (index 4) than "recognition" (index 0).
  const picked = pickClosestLevel(questions, "analysis");
  assert.equal(picked.cognitiveLevel, "transfer");
});

test("pickClosestLevel returns null for an empty bank rather than throwing", () => {
  assert.equal(pickClosestLevel([], "recall"), null);
});

test("isValidLevel rejects anything outside the whitelist", () => {
  assert.equal(isValidLevel("recall"), true);
  assert.equal(isValidLevel("expert"), false);
  assert.equal(isValidLevel(undefined), false);
});
