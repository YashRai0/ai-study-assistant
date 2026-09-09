import test from "node:test";
import assert from "node:assert/strict";
import { combineMisconceptionSignals } from "../src/services/misconceptionDetection.js";

test("no signals at all -> zero risk", () => {
  assert.equal(combineMisconceptionSignals({}), 0);
});

test("LLM severity alone maps to its weight", () => {
  assert.equal(combineMisconceptionSignals({ llmSeverity: "high" }), 1);
  assert.equal(combineMisconceptionSignals({ llmSeverity: "medium" }), 0.7);
  assert.equal(combineMisconceptionSignals({ llmSeverity: "low" }), 0.4);
});

test("pattern match alone (no LLM signal) contributes its own bonus", () => {
  const risk = combineMisconceptionSignals({ patternMatched: true });
  assert.equal(risk, 0.3);
});

test("pattern corroboration on top of a weak LLM signal raises risk less than double-counting would", () => {
  const lowAlone = combineMisconceptionSignals({ llmSeverity: "low" });
  const lowPlusPattern = combineMisconceptionSignals({ llmSeverity: "low", patternMatched: true });
  assert.ok(lowPlusPattern > lowAlone, "corroboration should raise risk");
  assert.ok(lowPlusPattern < lowAlone + 0.3, "should not simply add the full pattern bonus on top");
});

test("recurrence increases risk with diminishing returns and is capped", () => {
  const zero = combineMisconceptionSignals({ llmSeverity: "medium", priorOccurrences: 0 });
  const one = combineMisconceptionSignals({ llmSeverity: "medium", priorOccurrences: 1 });
  const many = combineMisconceptionSignals({ llmSeverity: "medium", priorOccurrences: 20 });
  assert.ok(one > zero);
  assert.ok(many > one);
  // capped contribution — shouldn't blow past 1 even with many occurrences
  assert.ok(many <= 1);
});

test("risk is always clamped to [0, 1]", () => {
  const risk = combineMisconceptionSignals({ llmSeverity: "high", patternMatched: true, priorOccurrences: 50 });
  assert.ok(risk >= 0 && risk <= 1);
});

test("all three signals agreeing produces the highest risk", () => {
  const allThree = combineMisconceptionSignals({ llmSeverity: "high", patternMatched: true, priorOccurrences: 3 });
  const llmOnly = combineMisconceptionSignals({ llmSeverity: "high" });
  assert.ok(allThree >= llmOnly);
});

import { normalizeDomain } from "../src/services/misconceptionDetection.js";

test("normalizeDomain matches a known domain within a free-text subject", () => {
  assert.equal(normalizeDomain("AP Biology"), "biology");
  assert.equal(normalizeDomain("Organic Chemistry II"), "chemistry");
  assert.equal(normalizeDomain("Physics 101"), "physics");
  assert.equal(normalizeDomain("Calculus (Math)"), "math");
});

test("normalizeDomain is case-insensitive", () => {
  assert.equal(normalizeDomain("BIOLOGY"), "biology");
});

test("normalizeDomain returns null for an unmapped or empty subject", () => {
  assert.equal(normalizeDomain("General"), null);
  assert.equal(normalizeDomain(""), null);
  assert.equal(normalizeDomain(undefined), null);
});
