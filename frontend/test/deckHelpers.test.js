import test from "node:test";
import assert from "node:assert/strict";
import {
  exportDeckToCsv,
  exportDeckToJson,
  calculateDeckRetentionMetrics,
  filterCardsByQuery
} from "../src/utils/deckHelpers.js";

test("exportDeckToCsv formats CSV with escaped quotes", () => {
  const cards = [
    { front: 'What is "CAP"?', back: "Consistency, Availability, Partition", subject: "Databases" },
    { front: "What is 2+2?", back: "4", subject: "Math" },
  ];
  const csv = exportDeckToCsv(cards);
  assert.ok(csv.includes('"Front","Back","Subject"'));
  assert.ok(csv.includes('""CAP""'));
  assert.ok(csv.includes('"Databases"'));
});

test("exportDeckToJson generates valid parseable JSON", () => {
  const cards = [{ front: "Q1", back: "A1", subject: "History" }];
  const jsonStr = exportDeckToJson(cards, "History 101");
  const parsed = JSON.parse(jsonStr);
  assert.equal(parsed.deckName, "History 101");
  assert.equal(parsed.cardCount, 1);
  assert.equal(parsed.cards[0].front, "Q1");
});

test("calculateDeckRetentionMetrics computes totals and subject breakdown", () => {
  const cards = [
    { front: "Q1", back: "A1", subject: "Biology" },
    { front: "Q2", back: "A2", subject: "Biology" },
    { front: "Q3", back: "A3", subject: "Chemistry" },
  ];
  const metrics = calculateDeckRetentionMetrics(cards);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.subjects.length, 2);
  const bio = metrics.subjects.find((s) => s.name === "Biology");
  assert.equal(bio.count, 2);
  assert.equal(bio.percentage, 67);
});

test("filterCardsByQuery filters cards across front, back, and subject", () => {
  const cards = [
    { front: "Gradient descent", back: "Optimization algorithm", subject: "ML" },
    { front: "Photosynthesis", back: "Converts light to glucose", subject: "Biology" },
  ];
  assert.equal(filterCardsByQuery(cards, "gradient").length, 1);
  assert.equal(filterCardsByQuery(cards, "glucose").length, 1);
  assert.equal(filterCardsByQuery(cards, "ml").length, 1);
  assert.equal(filterCardsByQuery(cards, "physics").length, 0);
  assert.equal(filterCardsByQuery(cards, "").length, 2);
});
