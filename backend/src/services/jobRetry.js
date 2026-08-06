/**
 * Job Retry Strategies & Resilience Patterns
 *
 * File: backend/src/services/jobRetry.js
 *
 * Defines exponential backoff, jitter, and failure handling strategies
 * for different queue types to ensure resilient async processing.
 */

/**
 * Exponential backoff with jitter
 *
 * Job attempt 1: wait 1s
 * Job attempt 2: wait 2-3s (1s base + 1s jitter)
 * Job attempt 3: wait 4-6s (4s base + 2s jitter)
 * Job attempt 4: wait 8-12s
 */
export const exponentialBackoff = (attemptsMade) => {
  const baseDelay = Math.pow(2, attemptsMade) * 1000; // 1s, 2s, 4s, 8s...
  const jitter = Math.random() * baseDelay * 0.5; // 0-50% random jitter
  return baseDelay + jitter;
};

/**
 * Linear backoff (faster recovery for transient errors)
 *
 * Job attempt 1: wait 2s
 * Job attempt 2: wait 4s
 * Job attempt 3: wait 6s
 */
export const linearBackoff = (attemptsMade) => {
  return (attemptsMade + 1) * 2000;
};

/**
 * Retry configurations per queue type
 *
 * maxAttempts: Total tries (including first attempt)
 * backoffStrategy: Which delay function to use
 * timeout: Max job execution time (ms)
 * removeOnComplete: Auto-delete after success
 * removeOnFail: Keep failed jobs for debugging
 */
export const retryStrategies = {
  uploadPdf: {
    maxAttempts: 3,
    backoffStrategy: "exponential",
    timeout: 60 * 1000, // 60s per PDF (most are <10s)
    removeOnComplete: { age: 3600 }, // Auto-cleanup after 1 hour
    removeOnFail: false, // Keep for debugging
  },

  embedChunks: {
    maxAttempts: 2, // Embeddings are deterministic; retry only once for transient errors
    backoffStrategy: "exponential",
    timeout: 5 * 60 * 1000, // 5min for 500-page PDF
    removeOnComplete: { age: 3600 },
    removeOnFail: false,
  },

  ocr: {
    maxAttempts: 2, // OCR is deterministic
    backoffStrategy: "linear", // Faster recovery for transient Tesseract issues
    timeout: 10 * 60 * 1000, // 10min for 500-page scan
    removeOnComplete: { age: 86400 }, // Keep 24h (large files)
    removeOnFail: false,
  },

  synthesis: {
    maxAttempts: 3, // LLM calls may have transient rate limits
    backoffStrategy: "exponential",
    timeout: 2 * 60 * 1000, // 2min per synthesis
    removeOnComplete: { age: 3600 },
    removeOnFail: false,
  },
};

/**
 * Classify errors for better retry strategies
 *
 * Retryable: network timeouts, rate limits, transient server errors
 * Non-retryable: bad input, authentication, permanent API failures
 */
export function isRetryableError(err) {
  const retryablePatterns = [
    /timeout/i,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /rate limit/i,
    /503/,
    /503 Service Unavailable/,
    /429 Too Many Requests/,
  ];

  return retryablePatterns.some((pattern) => pattern.test(err.message || err.code));
}

/**
 * Log retry decision for monitoring
 */
export function logRetry(job, err, willRetry) {
  if (willRetry) {
    console.log(
      `Job ${job.id} failed (attempt ${job.attemptsMade + 1}): ${err.message} — retrying`
    );
  } else {
    console.error(
      `Job ${job.id} failed permanently after ${job.attemptsMade} attempts: ${err.message}`
    );
  }
}

/**
 * In workers/index.js, attach error handlers:
 *
 * worker.on("failed", (job, err) => {
 *   const strategy = retryStrategies[worker.name];
 *   const willRetry = job.attemptsMade < strategy.maxAttempts && isRetryableError(err);
 *   logRetry(job, err, willRetry);
 * });
 */
