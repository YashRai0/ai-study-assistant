import { Worker } from "bullmq";
import { getRedis } from "../src/services/redis.js";
import logger from "../src/utils/logger.js";
import { retryStrategies, isRetryableError } from "../src/services/jobRetry.js";
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

/**
 * Initializes and starts all BullMQ workers.
 * Each processor is wrapped with withJobHardening so timeout and
 * error-classification retry rules are enforced.
 *
 * Can be run in-process within the HTTP server (default for single-instance/free hosting)
 * or in a standalone worker process (npm run worker).
 */
/**
 * Worker timing configurations to minimize idle Redis/Upstash command overhead.
 *
 * BullMQ Worker defaults drainDelay to 5s and stalledInterval to 30s.
 * Across 10 workers on serverless Redis like Upstash, those defaults generate
 * ~10-20 commands/sec (~1.3 million commands/day) purely on empty queues.
 *
 * - drainDelay: 30s (increases BZPOPMIN timeout from 5s to 30s, cutting idle polling by 83%).
 *   When a job is added to the queue, BullMQ pushes a marker that awakens BZPOPMIN immediately,
 *   so active jobs experience zero latency.
 * - stalledInterval: 300,000ms (5 minutes, reducing stalled check EVALSHA/EXISTS by 90%).
 *   Lock renewal for running jobs continues every 15s regardless of this setting.
 */
export const WORKER_DRAIN_DELAY = Number(process.env.WORKER_DRAIN_DELAY) || 30; // seconds
export const WORKER_STALLED_INTERVAL = Number(process.env.WORKER_STALLED_INTERVAL) || 5 * 60 * 1000; // 300,000 ms (5 min)

function getQueueConcurrency(queueName, defaultConcurrency) {
  const envKey = `WORKER_CONCURRENCY_${queueName.toUpperCase()}`;
  const envVal = Number(process.env[envKey]);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : defaultConcurrency;
}

function createWorkerOptions(queueName, defaultConcurrency) {
  return {
    connection: getRedis(),
    concurrency: getQueueConcurrency(queueName, defaultConcurrency),
    drainDelay: WORKER_DRAIN_DELAY,
    stalledInterval: WORKER_STALLED_INTERVAL,
  };
}

export function startWorkers() {
  const workers = [
    new Worker("uploadPdf", withJobHardening("uploadPdf", processPdfUpload), createWorkerOptions("uploadPdf", 2)),
    new Worker("uploadDocx", withJobHardening("uploadDocx", processDocxUpload), createWorkerOptions("uploadDocx", 2)),
    new Worker("uploadPptx", withJobHardening("uploadPptx", processPptxUpload), createWorkerOptions("uploadPptx", 2)),
    new Worker("ingestYoutube", withJobHardening("ingestYoutube", processYoutubeIngest), createWorkerOptions("ingestYoutube", 2)),
    new Worker("uploadAudio", withJobHardening("uploadAudio", processAudioUpload), createWorkerOptions("uploadAudio", 2)),

    new Worker("embedChunks", withJobHardening("embedChunks", processEmbedChunks), createWorkerOptions("embedChunks", 1)),

    new Worker("ocr", withJobHardening("ocr", processOcr), createWorkerOptions("ocr", 1)),

    new Worker("synthesis", withJobHardening("synthesis", processSynthesis), createWorkerOptions("synthesis", 2)),

    new Worker("learning", withJobHardening("learning", processLearning), createWorkerOptions("learning", 1)),
    new Worker("learningEvent", withJobHardening("learningEvent", processLearningEvent), createWorkerOptions("learningEvent", 4)),
  ];

  workers.forEach((worker) => {
    worker.on("completed", (job) => {
      logger.info(
        {
          jobId: job.id,
          queue: worker.name,
          result: job.returnvalue,
        },
        "Job completed"
      );
    });

    worker.on("failed", (job, err) => {
      if (!job) {
        logger.error(
          { queue: worker.name, error: err?.message || err },
          "Job failed without job context"
        );
        return;
      }

      const strategy = retryStrategies[worker.name] || {
        maxAttempts: job.opts?.attempts ?? 1,
      };

      const retryable = isRetryableError(err);
      const willRetry = job.attemptsMade < strategy.maxAttempts && retryable;

      if (willRetry) {
        logger.warn(
          {
            jobId: job.id,
            queue: worker.name,
            attempt: job.attemptsMade + 1,
            error: err?.message || err,
          },
          "Job failed; retrying"
        );
      } else {
        logger.error(
          {
            jobId: job.id,
            queue: worker.name,
            totalAttempts: job.attemptsMade,
            retryable,
            error: err?.message || err,
          },
          "Job failed permanently"
        );
      }
    });

    worker.on("error", (err) => {
      logger.error(
        {
          queue: worker.name,
          err,
        },
        "Worker error"
      );
    });
  });

  logger.info(
    {
      workerCount: workers.length,
    },
    "Workers started with retry strategies"
  );

  return workers;
}
