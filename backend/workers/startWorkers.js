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
function getQueueConcurrency(queueName, defaultConcurrency) {
  const envKey = `WORKER_CONCURRENCY_${queueName.toUpperCase()}`;
  const envVal = Number(process.env[envKey]);
  return Number.isFinite(envVal) && envVal > 0 ? envVal : defaultConcurrency;
}

export function startWorkers() {
  const workers = [
    new Worker("uploadPdf", withJobHardening("uploadPdf", processPdfUpload), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("uploadPdf", 2),
    }),
    new Worker("uploadDocx", withJobHardening("uploadDocx", processDocxUpload), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("uploadDocx", 2),
    }),
    new Worker("uploadPptx", withJobHardening("uploadPptx", processPptxUpload), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("uploadPptx", 2),
    }),
    new Worker("ingestYoutube", withJobHardening("ingestYoutube", processYoutubeIngest), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("ingestYoutube", 2),
    }),
    new Worker("uploadAudio", withJobHardening("uploadAudio", processAudioUpload), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("uploadAudio", 2),
    }),

    new Worker("embedChunks", withJobHardening("embedChunks", processEmbedChunks), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("embedChunks", 1),
    }),

    new Worker("ocr", withJobHardening("ocr", processOcr), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("ocr", 1),
    }),

    new Worker("synthesis", withJobHardening("synthesis", processSynthesis), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("synthesis", 2),
    }),

    new Worker("learning", withJobHardening("learning", processLearning), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("learning", 1),
    }),
    new Worker("learningEvent", withJobHardening("learningEvent", processLearningEvent), {
      connection: getRedis(),
      concurrency: getQueueConcurrency("learningEvent", 4),
    }),
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
