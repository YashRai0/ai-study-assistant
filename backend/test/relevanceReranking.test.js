import test from "node:test";
import assert from "node:assert/strict";
import { applyRelevanceScores } from "../src/services/llm.js";

test("reorders candidates by descending relevance score", () => {
  const candidates = [{ text: "low relevance" }, { text: "high relevance" }, { text: "medium relevance" }];
  const scores = [{ index: 0, relevanceScore: 0.2 }, { index: 1, relevanceScore: 0.9 }, { index: 2, relevanceScore: 0.5 }];

  const result = applyRelevanceScores(candidates, scores);

  assert.equal(result[0].text, "high relevance");
  assert.equal(result[1].text, "medium relevance");
  assert.equal(result[2].text, "low relevance");
});

test("annotates each candidate with its relevanceScore", () => {
  const candidates = [{ text: "a" }, { text: "b" }];
  const scores = [{ index: 0, relevanceScore: 0.3 }, { index: 1, relevanceScore: 0.7 }];
  const result = applyRelevanceScores(candidates, scores);
  assert.equal(result.find((c) => c.text === "a").relevanceScore, 0.3);
  assert.equal(result.find((c) => c.text === "b").relevanceScore, 0.7);
});

test("a candidate with no score from the LLM gets 0 and sorts last, rather than being dropped", () => {
  const candidates = [{ text: "scored" }, { text: "unscored" }];
  const scores = [{ index: 0, relevanceScore: 0.5 }]; // index 1 missing
  const result = applyRelevanceScores(candidates, scores);
  assert.equal(result.length, 2); // nothing dropped
  assert.equal(result[result.length - 1].text, "unscored");
  assert.equal(result.find((c) => c.text === "unscored").relevanceScore, 0);
});

test("does not mutate the original candidate objects", () => {
  const original = { text: "a" };
  const candidates = [original];
  applyRelevanceScores(candidates, [{ index: 0, relevanceScore: 0.9 }]);
  assert.equal(original.relevanceScore, undefined);
});

test("empty scores array leaves every candidate at 0 and preserves input order for ties", () => {
  const candidates = [{ text: "a" }, { text: "b" }];
  const result = applyRelevanceScores(candidates, []);
  assert.equal(result[0].relevanceScore, 0);
  assert.equal(result[1].relevanceScore, 0);
});
