import test from "node:test";
import assert from "node:assert/strict";

// SM-2 rating mapping used in Review.jsx
const RATINGS_MAP = {
  "1": { label: "Again", quality: 0 },
  "2": { label: "Hard", quality: 3 },
  "3": { label: "Good", quality: 4 },
  "4": { label: "Easy", quality: 5 },
};

function resolveRatingFromKey(key) {
  return RATINGS_MAP[key] ? RATINGS_MAP[key].quality : null;
}

function calculateProgress(index, total) {
  if (total <= 0) return 0;
  return Math.round(((index + 1) / total) * 100);
}

function clampIndex(newIndex, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(newIndex, total - 1));
}

function shuffleDeck(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

test("TactileFlashcard: maps rating keys 1-4 to correct SM-2 quality scores", () => {
  assert.equal(resolveRatingFromKey("1"), 0);
  assert.equal(resolveRatingFromKey("2"), 3);
  assert.equal(resolveRatingFromKey("3"), 4);
  assert.equal(resolveRatingFromKey("4"), 5);
  assert.equal(resolveRatingFromKey("5"), null);
  assert.equal(resolveRatingFromKey("x"), null);
});

test("TactileFlashcard: calculates progress percentage accurately", () => {
  assert.equal(calculateProgress(0, 10), 10);
  assert.equal(calculateProgress(4, 10), 50);
  assert.equal(calculateProgress(9, 10), 100);
  assert.equal(calculateProgress(0, 0), 0);
});

test("TactileFlashcard: clampIndex prevents out-of-bounds navigation", () => {
  assert.equal(clampIndex(-1, 5), 0);
  assert.equal(clampIndex(2, 5), 2);
  assert.equal(clampIndex(4, 5), 4);
  assert.equal(clampIndex(10, 5), 4);
});

test("TactileFlashcard: shuffle maintains card set integrity", () => {
  const deck = [
    { id: 1, front: "Q1" },
    { id: 2, front: "Q2" },
    { id: 3, front: "Q3" },
    { id: 4, front: "Q4" },
  ];
  const shuffled = shuffleDeck(deck);
  assert.equal(shuffled.length, deck.length);
  const ids = shuffled.map((c) => c.id).sort();
  assert.deepEqual(ids, [1, 2, 3, 4]);
});
