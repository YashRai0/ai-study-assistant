import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { retrieveTopK, bestScore, SIMILARITY_THRESHOLD } from "../src/services/vectorStore.js";

// Small hand-built vectors instead of real embeddings — the point is to
// verify the ranking/threshold *logic*, not the embedding model itself.
const IDENTICAL = [1, 0, 0];
const ORTHOGONAL = [0, 1, 0];
const OPPOSITE = [-1, 0, 0];
const SIMILAR = [0.9, 0.1, 0];

describe("retrieveTopK", () => {
  test("ranks chunks by cosine similarity, most similar first", () => {
    const chunks = [
      { text: "orthogonal", embedding: ORTHOGONAL },
      { text: "identical", embedding: IDENTICAL },
      { text: "similar", embedding: SIMILAR },
    ];
    const results = retrieveTopK(chunks, IDENTICAL, 3);
    assert.equal(results[0].text, "identical");
    assert.equal(results[1].text, "similar");
    assert.equal(results[2].text, "orthogonal");
    // scores should be in descending order
    assert.ok(results[0].score >= results[1].score);
    assert.ok(results[1].score >= results[2].score);
  });

  test("respects the k limit", () => {
    const chunks = [
      { text: "a", embedding: IDENTICAL },
      { text: "b", embedding: SIMILAR },
      { text: "c", embedding: ORTHOGONAL },
      { text: "d", embedding: OPPOSITE },
    ];
    const results = retrieveTopK(chunks, IDENTICAL, 2);
    assert.equal(results.length, 2);
  });

  test("passes through extra metadata fields (e.g. page, filename) but drops the embedding", () => {
    const chunks = [{ text: "hi", page: 12, filename: "notes.pdf", embedding: IDENTICAL }];
    const results = retrieveTopK(chunks, IDENTICAL, 1);
    assert.equal(results[0].page, 12);
    assert.equal(results[0].filename, "notes.pdf");
    assert.equal(results[0].embedding, undefined);
  });

  test("an identical vector scores at or near 1.0", () => {
    const results = retrieveTopK([{ text: "x", embedding: IDENTICAL }], IDENTICAL, 1);
    assert.ok(Math.abs(results[0].score - 1) < 1e-9);
  });

  test("an orthogonal vector scores at or near 0", () => {
    const results = retrieveTopK([{ text: "x", embedding: ORTHOGONAL }], IDENTICAL, 1);
    assert.ok(Math.abs(results[0].score) < 1e-9);
  });

  test("an opposite vector scores at or near -1", () => {
    const results = retrieveTopK([{ text: "x", embedding: OPPOSITE }], IDENTICAL, 1);
    assert.ok(Math.abs(results[0].score + 1) < 1e-9);
  });
});

describe("bestScore + SIMILARITY_THRESHOLD", () => {
  test("bestScore returns the top result's score", () => {
    const results = retrieveTopK(
      [
        { text: "a", embedding: SIMILAR },
        { text: "b", embedding: ORTHOGONAL },
      ],
      IDENTICAL,
      2
    );
    assert.equal(bestScore(results), results[0].score);
  });

  test("bestScore returns 0 for an empty result set (no chunks to compare)", () => {
    assert.equal(bestScore([]), 0);
  });

  test("a strong match clears SIMILARITY_THRESHOLD", () => {
    const results = retrieveTopK([{ text: "x", embedding: IDENTICAL }], IDENTICAL, 1);
    assert.ok(bestScore(results) >= SIMILARITY_THRESHOLD);
  });

  test("an orthogonal (unrelated) match falls below SIMILARITY_THRESHOLD", () => {
    const results = retrieveTopK([{ text: "x", embedding: ORTHOGONAL }], IDENTICAL, 1);
    assert.ok(bestScore(results) < SIMILARITY_THRESHOLD);
  });
});
