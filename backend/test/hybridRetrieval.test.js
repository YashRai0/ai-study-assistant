import test from "node:test";
import assert from "node:assert/strict";
import { hybridRetrieve } from "../src/services/hybridRetrieval.js";

// Query embedding is [1, 0] throughout — cosine similarity against it is
// just the x-component of any unit vector, which makes the expected scores
// easy to compute by hand.
const QUERY_EMBEDDING = [1, 0];
const QUERY = "krebs cycle produces atp";

test("returns [] for an empty chunk list or a non-positive k", () => {
  assert.deepEqual(hybridRetrieve([], QUERY, QUERY_EMBEDDING, 4), []);
  assert.deepEqual(hybridRetrieve([{ text: "x", embedding: [1, 0] }], QUERY, QUERY_EMBEDDING, 0), []);
});

test("a keyword-relevant chunk with a lower cosine score can outrank a keyword-irrelevant chunk with a higher one", () => {
  const chunks = [
    // Highest possible cosine similarity (identical direction to the query
    // embedding) but the text has nothing to do with the question.
    { text: "Photosynthesis occurs in the chloroplast using sunlight and water.", embedding: [1, 0] },
    // Lower cosine similarity, but the text is a near-exact match for the question.
    { text: "The Krebs cycle produces ATP in the mitochondria during cellular respiration.", embedding: [0.8, 0.6] },
    // Zero cosine similarity and no keyword relevance either.
    { text: "Cell membranes regulate the transport of molecules in and out of the cell.", embedding: [0, 1] },
  ];

  const results = hybridRetrieve(chunks, QUERY, QUERY_EMBEDDING, 2);
  assert.equal(results[0].text.includes("Krebs cycle produces ATP"), true);
});

test("the score field on results is the raw cosine similarity, not the hybrid or rerank score", () => {
  const chunks = [
    { text: "The Krebs cycle produces ATP.", embedding: [0.8, 0.6] },
    { text: "Unrelated filler text about something else entirely.", embedding: [1, 0] },
  ];
  const results = hybridRetrieve(chunks, QUERY, QUERY_EMBEDDING, 2);
  const krebsResult = results.find((r) => r.text.startsWith("The Krebs"));
  // cosine([0.8,0.6], [1,0]) = 0.8
  assert.ok(Math.abs(krebsResult.score - 0.8) < 1e-9);
  assert.equal("hybridScore" in krebsResult, false);
  assert.equal("rerankScore" in krebsResult, false);
});

test("results never include the raw embedding vector", () => {
  const chunks = [{ text: "The Krebs cycle produces ATP.", embedding: [0.8, 0.6], page: 3 }];
  const [result] = hybridRetrieve(chunks, QUERY, QUERY_EMBEDDING, 1);
  assert.equal("embedding" in result, false);
  assert.equal(result.page, 3); // other metadata still passes through
});

test("respects k even when far more chunks are available", () => {
  const chunks = Array.from({ length: 20 }, (_, i) => ({
    text: `Filler chunk number ${i} about various unrelated topics.`,
    embedding: [Math.random(), Math.random()],
  }));
  const results = hybridRetrieve(chunks, QUERY, QUERY_EMBEDDING, 3);
  assert.equal(results.length, 3);
});

test("does not throw when the chunk set is smaller than the widened candidate pool", () => {
  const chunks = [{ text: "The Krebs cycle produces ATP.", embedding: [1, 0] }];
  const results = hybridRetrieve(chunks, QUERY, QUERY_EMBEDDING, 10);
  assert.equal(results.length, 1);
});
