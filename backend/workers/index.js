import "dotenv/config";

/**
 * Worker Startup: BullMQ Processors
 *
 * Run separately from main server: `npm run worker`
 * Can run multiple workers in parallel (scale by adding more processes).
 * Each worker pulls jobs from Redis queues and executes them.
 *
 * In production, deploy as a separate container/service so server
 * and workers scale independently. One Redis instance serves all workers.
 */

import { Worker } from "bullmq";
import { connectDb } from "../src/db/mongoose.js";
import { getRedis, closeRedis } from "../src/services/redis.js";
import logger from "../src/utils/logger.js";
import { retryStrategies, isRetryableError, logRetry } from "../src/services/jobRetry.js";
import { withJobHardening } from "../src/services/jobHardening.js";

// Import processors
import { processPdfUpload } from "./processPdfUpload.js";
import { processDocxUpload } from "./processDocxUpload.js";
import { processPptxUpload } from "./processPptxUpload.js";
import { processYoutubeIngest } from "./processYoutubeIngest.js";
import { processAudioUpload } from "./processAudioUpload.js";
import { processEmbedChunks } from "./processEmbedChunks.js";
import { processOcr } from "./processOcr.js";
import { processSynthesis } from "./processSynthesis.js";
import { processLearning } from "./processLearning.js";
import { processLearningEvent } from "./processLearningEvent.js";

// Create workers (one per queue). Each processor is wrapped with
// withJobHardening so retryStrategies' timeout and error-classification
// config (previously read nowhere — see jobHardening.js) actually takes
// effect, without needing to touch any individual processor's own logic.
await connectDb();
const workers = [
  new Worker("uploadPdf", withJobHardening("uploadPdf", processPdfUpload), { connection: getRedis(), concurrency: 2 }),
  new Worker("uploadDocx", withJobHardening("uploadDocx", processDocxUpload), { connection: getRedis(), concurrency: 2 }),
  new Worker("uploadPptx", withJobHardening("uploadPptx", processPptxUpload), { connection: getRedis(), concurrency: 2 }),
  new Worker("ingestYoutube", withJobHardening("ingestYoutube", processYoutubeIngest), { connection: getRedis(), concurrency: 2 }),
  new Worker("uploadAudio", withJobHardening("uploadAudio", processAudioUpload), { connection: getRedis(), concurrency: 2 }),

  new Worker("embedChunks", withJobHardening("embedChunks", processEmbedChunks), { connection: getRedis(), concurrency: 1 }),

  new Worker("ocr", withJobHardening("ocr", processOcr), { connection: getRedis(), concurrency: 1 }),

  new Worker("synthesis", withJobHardening("synthesis", processSynthesis), { connection: getRedis(), concurrency: 2 }),

  new Worker("learning", withJobHardening("learning", processLearning), { connection: getRedis(), concurrency: 1 }),
  new Worker("learningEvent", withJobHardening("learningEvent", processLearningEvent), { connection: getRedis(), concurrency: 4 }),
];

// Log job lifecycle events
workers.forEach((worker) => {
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, queue: worker.name, result: job.returnvalue }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    // Falls back to a conservative default (single attempt, already
    // exhausted) instead of throwing if a queue is ever added without a
    // matching entry in retryStrategies — this handler runs inside a
    // synchronous BullMQ event listener, so an uncaught exception here
    // would crash the entire worker process (all six queues), not just
    // whichever job failed. This is exactly what happened before
    // `learning`/`learningEvent` had entries here: every failure in
    // either queue took down PDF upload, embedding, OCR, and synthesis
    // processing along with it.
    const strategy = retryStrategies[worker.name] || { maxAttempts: job.opts?.attempts ?? 1 };
    const retryable = isRetryableError(err);
    const willRetry = job.attemptsMade < strategy.maxAttempts && retryable;

    if (willRetry) {
      logger.warn(
        { jobId: job.id, queue: worker.name, attempt: job.attemptsMade + 1, error: err.message },
        "Job failed; retrying"
      );
    } else {
      logger.error(
        {
          jobId: job.id,
          queue: worker.name,
          totalAttempts: job.attemptsMade,
          retryable,
          error: err.message,
        },
        "Job failed permanently"
      );
    }
  });

  worker.on("error", (err) => {
    logger.error({ queue: worker.name, err }, "Worker error");
  });
});

logger.info({ workerCount: workers.length }, "Workers started with retry strategies");

/**
 * Graceful shutdown: drain queues and close connections
 */
async function shutdown() {
  logger.info("Shutting down workers...");

  // Close all workers
  for (const worker of workers) {
    await worker.close();
  }

  // Close Redis
  await closeRedis();

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Prevent the process from exiting
process.stdin.resume();
