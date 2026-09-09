import test from "node:test";
import assert from "node:assert/strict";
import { deriveReviewQuality } from "../src/services/mastery.js";
import { QUALITY } from "../src/services/spacedRepetition.js";

test("an incorrect answer is always AGAIN, regardless of confidence", () => {
  assert.equal(deriveReviewQuality({ correct: false, score: 0, confidence: 5 }), QUALITY.AGAIN);
  assert.equal(deriveReviewQuality({ correct: false, score: 0.9, confidence: 1 }), QUALITY.AGAIN);
});

test("correct but a very low score (barely-passing partial credit) is still AGAIN", () => {
  assert.equal(deriveReviewQuality({ correct: true, score: 0.2, confidence: 3 }), QUALITY.AGAIN);
});

test("a high misconception risk caps quality at HARD even with a high score", () => {
  const result = deriveReviewQuality({ correct: true, score: 0.95, confidence: 5, misconceptionRisk: 0.7 });
  assert.equal(result, QUALITY.HARD);
});

test("high score + high confidence + low risk is EASY", () => {
  const result = deriveReviewQuality({ correct: true, score: 0.9, confidence: 5, misconceptionRisk: 0.1 });
  assert.equal(result, QUALITY.EASY);
});

test("high score but low confidence is GOOD, not EASY", () => {
  const result = deriveReviewQuality({ correct: true, score: 0.9, confidence: 2, misconceptionRisk: 0 });
  assert.equal(result, QUALITY.GOOD);
});

test("a middling score (correct, but not strong) is HARD", () => {
  const result = deriveReviewQuality({ correct: true, score: 0.5, confidence: 3, misconceptionRisk: 0 });
  assert.equal(result, QUALITY.HARD);
});

test("missing score falls back to correct ? 1 : 0, so a plain correct answer can still be EASY", () => {
  const result = deriveReviewQuality({ correct: true, score: null, confidence: 5, misconceptionRisk: 0 });
  assert.equal(result, QUALITY.EASY);
});

test("defaults (no confidence/misconceptionRisk given) don't throw and produce a valid quality", () => {
  const result = deriveReviewQuality({ correct: true, score: 0.7 });
  assert.ok(Object.values(QUALITY).includes(result));
});
