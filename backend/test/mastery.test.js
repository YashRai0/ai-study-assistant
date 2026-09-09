import test from "node:test";
import assert from "node:assert/strict";
import { calculatePerformance, calculateMastery } from "../src/services/mastery.js";

test("mastery increases after a correct difficult answer", () => {
  const performance = calculatePerformance({ correctness: 1, confidence: 4, difficulty: 4 });
  const mastery = calculateMastery(0.4, performance);
  assert.ok(mastery > 0.4);
  assert.ok(mastery <= 1);
});

test("mastery decreases or moves slowly after an incorrect confident answer", () => {
  const performance = calculatePerformance({ correctness: 0, confidence: 5, difficulty: 3 });
  const mastery = calculateMastery(0.8, performance);
  assert.ok(mastery < 0.8);
});


test("performance rewards correct answers with higher difficulty", () => {
  const easy = calculatePerformance({ correctness: 1, confidence: 3, difficulty: 1 });
  const hard = calculatePerformance({ correctness: 1, confidence: 3, difficulty: 5 });
  assert.ok(hard > easy);
});

test("incorrect confident answers produce lower performance than incorrect uncertain answers", () => {
  const confident = calculatePerformance({ correctness: 0, confidence: 5, difficulty: 3 });
  const uncertain = calculatePerformance({ correctness: 0, confidence: 1, difficulty: 3 });
  assert.ok(confident < uncertain);
});
