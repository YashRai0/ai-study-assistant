import { UnrecoverableError } from "bullmq";
import { retryStrategies, isRetryableError } from "./jobRetry.js";

/**
 * Wraps a job processor so the two "configuration exists ≠ configuration
 * is enforced" gaps in jobRetry.js's retryStrategies actually take effect:
 *
 * 1. `timeout` was defined per queue but nothing ever read it — BullMQ
 *    has no built-in generic "kill this job after N ms" option, so this
 *    races the processor against a timer and fails the job if it runs
 *    long. Important limitation: this does NOT cancel the in-flight work
 *    itself (Promise.race can't reach into, say, a running LLM call or
 *    parse loop and stop it) — it only stops *waiting* on it and reports
 *    failure so BullMQ can retry or give up sooner. True cancellation
 *    would need each processor's own I/O calls to accept an AbortSignal;
 *    that's a larger, processor-by-processor change, not something a
 *    generic wrapper can safely retrofit.
 *
 * 2. `isRetryableError` classification was only ever used to log a nicer
 *    message in workers/index.js's `worker.on("failed")` handler — which
 *    fires *after* BullMQ has already decided whether to retry, so it
 *    never actually prevented a single retry. Throwing BullMQ's own
 *    UnrecoverableError for a classified-non-retryable error is the real
 *    mechanism: it tells BullMQ to stop immediately regardless of the
 *    job's configured `attempts`, instead of burning the rest of them
 *    failing the identical way on a permanently-corrupt input.
 */
export function withJobHardening(queueName, processor) {
  const timeoutMs = retryStrategies[queueName]?.timeout;

  return async function hardenedProcessor(job) {
    let timer;
    const work = processor(job);
    // Promise.race doesn't consume the losing promise — without this, a
    // job that times out here but later rejects on its own (once the
    // real work actually finishes) would surface as an unrelated
    // unhandled rejection, potentially crashing the whole worker process
    // over a job that's already been reported as failed.
    work.catch(() => {});

    try {
      if (!timeoutMs) return await work;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job exceeded its ${timeoutMs}ms timeout`)), timeoutMs);
      });
      return await Promise.race([work, timeout]);
    } catch (err) {
      if (err instanceof UnrecoverableError) throw err;
      if (!isRetryableError(err)) {
        const unrecoverable = new UnrecoverableError(err.message);
        unrecoverable.cause = err;
        throw unrecoverable;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
}
