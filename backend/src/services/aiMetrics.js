// AI Observability & Telemetry Service (Step 19)
// Lightweight in-memory telemetry for monitoring LLM costs, cache hit rates,
// rate limits, and latency without leaking sensitive student data or API keys.

const metrics = {
  requestsTotal: 0,
  requestsByOperation: {},
  requestLatencyTotalMs: 0,
  requestLatencyCount: 0,
  inputTokensTotal: 0,
  outputTokensTotal: 0,
  cacheHitsTotal: 0,
  cacheMissesTotal: 0,
  cacheErrorsTotal: 0,
  rateLimitRetriesTotal: 0,
  failuresTotal: 0,
  failuresByOperation: {},
};

export function recordAiRequest({
  operation = "unknown",
  latencyMs = 0,
  inputTokens = 0,
  outputTokens = 0,
  success = true,
} = {}) {
  metrics.requestsTotal += 1;
  metrics.requestsByOperation[operation] = (metrics.requestsByOperation[operation] || 0) + 1;
  metrics.requestLatencyTotalMs += latencyMs;
  metrics.requestLatencyCount += 1;
  metrics.inputTokensTotal += inputTokens;
  metrics.outputTokensTotal += outputTokens;

  if (!success) {
    metrics.failuresTotal += 1;
    metrics.failuresByOperation[operation] = (metrics.failuresByOperation[operation] || 0) + 1;
  }
}

export function recordCacheHit(operation = "unknown") {
  metrics.cacheHitsTotal += 1;
}

export function recordCacheMiss(operation = "unknown") {
  metrics.cacheMissesTotal += 1;
}

export function recordCacheError(operation = "unknown") {
  metrics.cacheErrorsTotal += 1;
}

export function recordRateLimitRetry(operation = "unknown") {
  metrics.rateLimitRetriesTotal += 1;
}

export function getAiMetrics() {
  const avgLatencyMs = metrics.requestLatencyCount
    ? Math.round(metrics.requestLatencyTotalMs / metrics.requestLatencyCount)
    : 0;

  const totalCacheLookups = metrics.cacheHitsTotal + metrics.cacheMissesTotal;
  const cacheHitRate = totalCacheLookups
    ? Number((metrics.cacheHitsTotal / totalCacheLookups).toFixed(4))
    : 0;

  return {
    ai_requests_total: metrics.requestsTotal,
    ai_requests_by_operation: { ...metrics.requestsByOperation },
    ai_request_avg_latency_ms: avgLatencyMs,
    ai_input_tokens: metrics.inputTokensTotal,
    ai_output_tokens: metrics.outputTokensTotal,
    ai_cache_hits: metrics.cacheHitsTotal,
    ai_cache_misses: metrics.cacheMissesTotal,
    ai_cache_hit_rate: cacheHitRate,
    ai_cache_errors: metrics.cacheErrorsTotal,
    ai_rate_limit_retries: metrics.rateLimitRetriesTotal,
    ai_failures: metrics.failuresTotal,
    ai_failures_by_operation: { ...metrics.failuresByOperation },
  };
}

export function resetAiMetrics() {
  metrics.requestsTotal = 0;
  metrics.requestsByOperation = {};
  metrics.requestLatencyTotalMs = 0;
  metrics.requestLatencyCount = 0;
  metrics.inputTokensTotal = 0;
  metrics.outputTokensTotal = 0;
  metrics.cacheHitsTotal = 0;
  metrics.cacheMissesTotal = 0;
  metrics.cacheErrorsTotal = 0;
  metrics.rateLimitRetriesTotal = 0;
  metrics.failuresTotal = 0;
  metrics.failuresByOperation = {};
}
