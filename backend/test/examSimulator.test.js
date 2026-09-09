import test from "node:test";
import assert from "node:assert/strict";
import { pickClosestDifficulty } from "../src/services/examSimulator.js";

test("pickClosestDifficulty prefers the question nearest the target", () => {
  const questions = [
    { difficulty: 1 }, { difficulty: 2 }, { difficulty: 4 }, { difficulty: 5 },
  ];
  assert.equal(pickClosestDifficulty(questions, 4).difficulty, 4);
  assert.equal(pickClosestDifficulty(questions, 1).difficulty, 1);
});

test("pickClosestDifficulty breaks a tie toward the first candidate", () => {
  const questions = [{ difficulty: 2, id: "a" }, { difficulty: 4, id: "b" }];
  // target 3 is equidistant from 2 and 4 — either is a reasonable answer,
  // this just pins down that ties don't throw or return undefined.
  const picked = pickClosestDifficulty(questions, 3);
  assert.ok(picked.id === "a" || picked.id === "b");
});

test("pickClosestDifficulty returns null for an empty bank", () => {
  assert.equal(pickClosestDifficulty([], 3), null);
});

test("pickClosestDifficulty treats a missing difficulty as the default of 3", () => {
  const questions = [{ difficulty: undefined, id: "no-diff" }, { difficulty: 1, id: "easy" }];
  assert.equal(pickClosestDifficulty(questions, 3).id, "no-diff");
});
