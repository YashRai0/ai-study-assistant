import test from "node:test";
import assert from "node:assert/strict";
import { hybridRetrieveWithNeuralRerank } from "../src/services/hybridRetrieval.js";

test("retrieval: hybridRetrieveWithNeuralRerank returns empty array when chunks are empty", async () => {
  const result = await hybridRetrieveWithNeuralRerank([], "what is mitosis?", new Array(384).fill(0.1));
  assert.deepEqual(result, []);
});

test("retrieval: high confidence heuristic match skips neural reranker LLM call", async () => {
  // Query embedding identical to chunk 1 embedding -> cosine similarity = 1.0 (>= 0.65 threshold)
  const embedding = new Array(384).fill(0.1);
  const chunks = [
    { _id: "c1", text: "Mitosis is the process of cell division.", embedding },
    { _id: "c2", text: "Photosynthesis happens in plants.", embedding: new Array(384).fill(0) },
  ];

  // If neural reranker were called, it would fail or require LLM network call.
  // Because top score is 1.0 >= 0.65, it must bypass rerankByRelevance cleanly.
  const result = await hybridRetrieveWithNeuralRerank(chunks, "Mitosis", embedding, 1);
  assert.equal(result.length, 1);
  assert.equal(result[0]._id, "c1");
});
