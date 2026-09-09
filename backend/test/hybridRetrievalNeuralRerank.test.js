import test from "node:test";
import assert from "node:assert/strict";
import { hybridRetrieveWithNeuralRerank } from "../src/services/hybridRetrieval.js";

test("empty chunk pool short-circuits without attempting an LLM call", async () => {
  // No GROQ_API_KEY needed for this — if the function tried to call the
  // LLM here, it would throw (no valid key in this test environment); the
  // fact that it resolves cleanly proves the empty-pool early return works.
  const result = await hybridRetrieveWithNeuralRerank([], "some query", [0.1, 0.2], 4);
  assert.deepEqual(result, []);
});
