import test from "node:test";
import assert from "node:assert/strict";
import { embedText, embedChunks } from "../src/services/embeddings.js";

test("embeddings: embedChunks returns empty array for empty input", async () => {
  const result = await embedChunks([]);
  assert.deepEqual(result, []);
});

test("embeddings: embedChunks produces 384-dimensional embeddings matching individual embedText results", async () => {
  const texts = [
    "Photosynthesis converts sunlight into chemical energy.",
    "The mitochondria is the powerhouse of the cell.",
  ];

  const batchResults = await embedChunks(texts);
  assert.equal(batchResults.length, 2);
  assert.equal(batchResults[0].length, 384);
  assert.equal(batchResults[1].length, 384);

  const single1 = await embedText(texts[0]);
  const single2 = await embedText(texts[1]);

  // Numerical equivalence with exact zero drift
  for (let i = 0; i < 384; i++) {
    assert.equal(batchResults[0][i], single1[i]);
    assert.equal(batchResults[1][i], single2[i]);
  }
});
