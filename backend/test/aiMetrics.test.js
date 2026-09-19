import test from "node:test";
import assert from "node:assert/strict";
import {
  recordAiRequest,
  recordCacheHit,
  recordCacheMiss,
  recordCacheError,
  getAiMetrics,
  resetAiMetrics,
} from "../src/services/aiMetrics.js";

test("aiMetrics: tracks requests, latencies, tokens, and per-operation cache stats", () => {
  resetAiMetrics();

  recordAiRequest({ operation: "summary", latencyMs: 250, inputTokens: 500, outputTokens: 100, success: true });
  recordAiRequest({ operation: "rerank", latencyMs: 150, inputTokens: 200, outputTokens: 50, success: true });

  recordCacheHit("summary");
  recordCacheHit("summary");
  recordCacheHit("rerank");

  recordCacheMiss("summary");
  recordCacheMiss("diagnostic_generation");

  recordCacheError("rerank");

  const m = getAiMetrics();

  assert.equal(m.ai_requests_total, 2);
  assert.equal(m.ai_requests_by_operation.summary, 1);
  assert.equal(m.ai_requests_by_operation.rerank, 1);
  assert.equal(m.ai_input_tokens, 700);
  assert.equal(m.ai_output_tokens, 150);

  // Cache stats total and per-operation
  assert.equal(m.ai_cache_hits, 3);
  assert.equal(m.ai_cache_hits_by_operation.summary, 2);
  assert.equal(m.ai_cache_hits_by_operation.rerank, 1);

  assert.equal(m.ai_cache_misses, 2);
  assert.equal(m.ai_cache_misses_by_operation.summary, 1);
  assert.equal(m.ai_cache_misses_by_operation.diagnostic_generation, 1);

  assert.equal(m.ai_cache_errors, 1);
  assert.equal(m.ai_cache_errors_by_operation.rerank, 1);

  assert.equal(m.ai_cache_hit_rate, Number((3 / 5).toFixed(4)));

  resetAiMetrics();
  const resetM = getAiMetrics();
  assert.equal(resetM.ai_cache_hits, 0);
  assert.deepEqual(resetM.ai_cache_hits_by_operation, {});
});
