import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, bm25Scores, queryCoverage, hasPhrase } from "../src/services/keywordSearch.js";

test("tokenize lowercases, splits on non-alphanumerics, and drops stopwords/short tokens", () => {
  assert.deepEqual(tokenize("The Krebs Cycle produces ATP!"), ["krebs", "cycle", "produces", "atp"]);
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
});

test("bm25Scores gives zero to chunks with no matching terms", () => {
  const chunks = [{ text: "Mitochondria are the powerhouse of the cell." }, { text: "Photosynthesis occurs in chloroplasts." }];
  const scores = bm25Scores(chunks, tokenize("krebs cycle"));
  assert.deepEqual(scores, [0, 0]);
});

test("bm25Scores scores an exact-term chunk higher than an unrelated one", () => {
  const chunks = [
    { text: "The Krebs cycle is a series of reactions in cellular respiration." },
    { text: "Photosynthesis converts light energy into chemical energy." },
  ];
  const scores = bm25Scores(chunks, tokenize("krebs cycle"));
  assert.ok(scores[0] > scores[1]);
});

test("bm25Scores rewards a rarer matching term more than a common one (IDF)", () => {
  // "cell" appears in every chunk (uninformative), "mitochondria" is rare —
  // a chunk matching the rare term should score higher for an equal-length match.
  const chunks = [
    { text: "The cell has many parts and functions in the cell." },
    { text: "Mitochondria produce energy for the cell." },
    { text: "The cell wall protects plant cells." },
  ];
  const scores = bm25Scores(chunks, tokenize("mitochondria"));
  assert.ok(scores[1] > scores[0]);
  assert.ok(scores[1] > scores[2]);
});

test("bm25Scores handles an empty chunk list or empty query without throwing", () => {
  assert.deepEqual(bm25Scores([], tokenize("anything")), []);
  assert.deepEqual(bm25Scores([{ text: "some text" }], []), [0]);
});

test("queryCoverage measures the fraction of distinct query terms present", () => {
  const tokens = tokenize("krebs cycle atp production");
  assert.equal(queryCoverage("The Krebs cycle involves atp production.", tokens), 1);
  assert.equal(queryCoverage("The Krebs cycle happens in mitochondria.", tokens), 0.5);
  assert.equal(queryCoverage("Photosynthesis occurs in chloroplasts.", tokens), 0);
});

test("hasPhrase matches a contiguous substring, not scattered terms", () => {
  assert.equal(hasPhrase("The Krebs cycle produces ATP.", "krebs cycle"), true);
  assert.equal(hasPhrase("Cycle first, then Krebs later.", "krebs cycle"), false);
  assert.equal(hasPhrase("Anything at all", "ab"), false); // too short to count as a phrase
});
