import test from "node:test";
import assert from "node:assert/strict";
import { recallAtK, precisionAtK, reciprocalRank, summarizeRun, keywordOnlyRetrieve } from "../src/services/retrievalEval.js";

test("recallAtK: all relevant chunks found in top K is a perfect score", () => {
  assert.equal(recallAtK(["a", "b", "c"], ["a", "b"], 3), 1);
});

test("recallAtK: relevant chunks outside top K don't count", () => {
  assert.equal(recallAtK(["a", "x", "y", "z"], ["a", "b"], 3), 0.5); // only "a" found, "b" is missing entirely
});

test("recallAtK: a query with no ground truth returns null, not 0", () => {
  assert.equal(recallAtK(["a", "b"], [], 3), null);
  assert.equal(recallAtK(["a", "b"], undefined, 3), null);
});

test("precisionAtK: half the top K being relevant is 0.5", () => {
  assert.equal(precisionAtK(["a", "x", "b", "y"], ["a", "b"], 4), 0.5);
});

test("precisionAtK: an empty retrieval list is 0 precision, not NaN", () => {
  assert.equal(precisionAtK([], ["a"], 4), 0);
});

test("precisionAtK: only counts within the K cutoff, ignores relevant results beyond it", () => {
  // "b" is relevant but ranked 5th, outside k=2 — shouldn't inflate precision@2
  assert.equal(precisionAtK(["a", "x", "y", "z", "b"], ["a", "b"], 2), 0.5);
});

test("reciprocalRank: first result relevant is 1.0", () => {
  assert.equal(reciprocalRank(["a", "x", "y"], ["a"]), 1);
});

test("reciprocalRank: second result relevant is 0.5", () => {
  assert.equal(reciprocalRank(["x", "a", "y"], ["a"]), 0.5);
});

test("reciprocalRank: nothing relevant retrieved at all is 0", () => {
  assert.equal(reciprocalRank(["x", "y", "z"], ["a"]), 0);
});

test("reciprocalRank considers the full list, not just a top-K cutoff", () => {
  const retrieved = Array.from({ length: 20 }, (_, i) => `chunk${i}`);
  retrieved[15] = "a"; // relevant result ranked 16th
  assert.equal(reciprocalRank(retrieved, ["a"]), 1 / 16);
});

test("summarizeRun: averages metrics across queries, excluding unlabeled ones", () => {
  const results = [
    { retrievedIds: ["a", "b"], relevantIds: ["a"], k: 2 }, // recall 1, precision 0.5, rr 1
    { retrievedIds: ["x", "y"], relevantIds: ["a"], k: 2 }, // recall 0, precision 0, rr 0
    { retrievedIds: ["z"], relevantIds: [], k: 2 }, // no ground truth — must be excluded, not scored as 0
  ];
  const summary = summarizeRun(results);
  assert.equal(summary.sampleSize, 2); // the unlabeled query is excluded
  assert.equal(summary.recallAtK, 0.5); // (1 + 0) / 2
  assert.equal(summary.precisionAtK, 0.25); // (0.5 + 0) / 2
  assert.equal(summary.mrr, 0.5); // (1 + 0) / 2
});

test("summarizeRun: all-unlabeled input returns null rather than an empty/NaN summary", () => {
  assert.equal(summarizeRun([{ retrievedIds: ["a"], relevantIds: [], k: 2 }]), null);
  assert.equal(summarizeRun([]), null);
});

test("keywordOnlyRetrieve: ranks chunks by keyword overlap, returns at most k", () => {
  const chunks = [
    { _id: "1", text: "Photosynthesis converts light energy into chemical energy in plants." },
    { _id: "2", text: "The weather today is sunny with a chance of rain." },
    { _id: "3", text: "Photosynthesis occurs in the chloroplast using light energy." },
  ];
  const results = keywordOnlyRetrieve(chunks, "photosynthesis light energy", 2);
  assert.equal(results.length, 2);
  const ids = results.map((r) => r._id);
  assert.ok(ids.includes("1"));
  assert.ok(ids.includes("3"));
  assert.ok(!ids.includes("2"));
});

test("keywordOnlyRetrieve: empty chunk list or k<=0 returns empty array", () => {
  assert.deepEqual(keywordOnlyRetrieve([], "anything", 4), []);
  assert.deepEqual(keywordOnlyRetrieve([{ _id: "1", text: "x" }], "anything", 0), []);
});
