import test from "node:test";
import assert from "node:assert/strict";
import { AI_TASK_POLICY, getTaskPolicy, MAX_OUTPUT_TOKENS_CEILING } from "../src/services/aiPolicy.js";

test("aiPolicy: defines policies for all primary AI operations", () => {
  const expectedOperations = [
    "chat",
    "simple_explanation",
    "summary",
    "flashcards",
    "quiz_generation",
    "concept_extraction",
    "diagnostic_generation",
    "tutor_intervention",
    "eval_free_response",
    "rerank",
    "misconception_risk",
    "compression_segment",
  ];

  for (const op of expectedOperations) {
    assert.ok(AI_TASK_POLICY[op], `Policy should exist for operation ${op}`);
    const policy = AI_TASK_POLICY[op];
    assert.ok(typeof policy.maxTokens === "number" && policy.maxTokens > 0, `${op} must have valid maxTokens`);
    assert.ok(policy.maxTokens <= MAX_OUTPUT_TOKENS_CEILING, `${op} maxTokens must not exceed ceiling`);
    assert.ok(["low", "medium", "high"].includes(policy.reasoningEffort), `${op} must have valid reasoningEffort`);
    assert.ok(typeof policy.promptVersion === "string" && policy.promptVersion.length > 0, `${op} must have promptVersion`);
    assert.ok(typeof policy.jsonMode === "boolean", `${op} must define jsonMode`);
    assert.ok(typeof policy.cacheable === "boolean", `${op} must define cacheable`);
  }
});

test("aiPolicy: getTaskPolicy returns correct policy or sensible fallback", () => {
  const summaryPolicy = getTaskPolicy("summary");
  assert.equal(summaryPolicy.maxTokens, 1200);
  assert.equal(summaryPolicy.cacheable, true);

  const fallback = getTaskPolicy("unknown_operation");
  assert.equal(fallback.maxTokens, 2048);
  assert.equal(fallback.reasoningEffort, "low");
  assert.equal(fallback.promptVersion, "generic:v1");
});

test("aiPolicy: JSON tasks have jsonMode set to true", () => {
  assert.equal(getTaskPolicy("flashcards").jsonMode, true);
  assert.equal(getTaskPolicy("quiz_generation").jsonMode, true);
  assert.equal(getTaskPolicy("concept_extraction").jsonMode, true);
  assert.equal(getTaskPolicy("rerank").jsonMode, true);
  assert.equal(getTaskPolicy("chat").jsonMode, false);
});
