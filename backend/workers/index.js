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
import { getRedis, closeRedis } from "../src/services/redis.js";
import { logger } from "../src/services/logger.js";
import { retryStrategies, isRetryableError, logRetry } from "../src/services/jobRetry.js";

// Import processors
import { processPdfUpload } from "./processPdfUpload.js";
import { processEmbedChunks } from "./processEmbedChunks.js";
import { processOcr } from "./processOcr.js";
import { processSynthesis } from "./processSynthesis.js";

// Create workers (one per queue)
const workers = [
  new Worker("uploadPdf", processPdfUpload, {
    connection: getRedis(),
    concurrency: 2,
    settings: {
      attempts: retryStrategies.uploadPdf.maxAttempts,
      backoffStrategy: retryStrategies.uploadPdf.backoffStrategy,
      backoffStrategies: {
        exponential: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
        linear: (attemptsMade) => (attemptsMade + 1) * 2000,
      },
    },
  }),

  new Worker("embedChunks", processEmbedChunks, {
    connection: getRedis(),
    concurrency: 1,
    settings: {
      attempts: retryStrategies.embedChunks.maxAttempts,
      backoffStrategy: retryStrategies.embedChunks.backoffStrategy,
      backoffStrategies: {
        exponential: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
        linear: (attemptsMade) => (attemptsMade + 1) * 2000,
      },
    },
  }),

  new Worker("ocr", processOcr, {
    connection: getRedis(),
    concurrency: 1,
    settings: {
      attempts: retryStrategies.ocr.maxAttempts,
      backoffStrategy: retryStrategies.ocr.backoffStrategy,
      backoffStrategies: {
        exponential: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
        linear: (attemptsMade) => (attemptsMade + 1) * 2000,
      },
    },
  }),

  new Worker("synthesis", processSynthesis, {
    connection: getRedis(),
    concurrency: 2,
    settings: {
      attempts: retryStrategies.synthesis.maxAttempts,
      backoffStrategy: retryStrategies.synthesis.backoffStrategy,
      backoffStrategies: {
        exponential: (attemptsMade) => Math.pow(2, attemptsMade) * 1000,
        linear: (attemptsMade) => (attemptsMade + 1) * 2000,
      },
    },
  }),
];

// Log job lifecycle events
workers.forEach((worker) => {
  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, queue: worker.name, result: job.returnvalue }, "Job completed");
  });

  worker.on("failed", (job, err) => {
    const strategy = retryStrategies[worker.name];
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
