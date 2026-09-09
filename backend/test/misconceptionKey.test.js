import test from "node:test";
import assert from "node:assert/strict";
import { misconceptionKey } from "../src/services/misconceptionDetection.js";

test("two differently-punctuated/cased descriptions of the same misconception normalize to the same key", () => {
  const a = misconceptionKey("Thinks heavier objects fall faster!");
  const b = misconceptionKey("thinks HEAVIER objects fall faster");
  assert.equal(a, b);
});

test("genuinely different misconceptions on the same concept normalize to different keys", () => {
  const a = misconceptionKey("Thinks heavier objects fall faster");
  const b = misconceptionKey("Confuses mass with weight");
  assert.notEqual(a, b);
});

test("null, undefined, and empty string all produce an empty key without throwing", () => {
  assert.equal(misconceptionKey(null), "");
  assert.equal(misconceptionKey(undefined), "");
  assert.equal(misconceptionKey(""), "");
});

test("collapses internal whitespace and strips punctuation", () => {
  assert.equal(misconceptionKey("  Multiple   spaces, and punctuation!!  "), "multiple spaces and punctuation");
});

test("caps length so an unusually long LLM description doesn't produce an unbounded index key", () => {
  const long = "a".repeat(1000);
  const key = misconceptionKey(long);
  assert.ok(key.length <= 300);
});
