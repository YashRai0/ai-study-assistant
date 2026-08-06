import { Queue } from "bullmq";
import { getRedis } from "./redis.js";
import { logger } from "./logger.js";

/**
 * BullMQ Queues for async background jobs.
 *
 * Job names follow pattern: "PDF upload" → uploadPdf queue
 * Data schema validated by each worker.
 */

// PDF parsing: extract text, metadata, page count from raw PDF file
export const uploadPdfQueue = new Queue("uploadPdf", { connection: getRedis() });

// Chunking & embedding: split text into semantic chunks, generate embeddings
export const embedChunksQueue = new Queue("embedChunks", { connection: getRedis() });

// OCR: extract text from scanned PDF pages
export const ocrQueue = new Queue("ocr", { connection: getRedis() });

// Text synthesis: generate summaries, flashcards, study guides via LLM
export const synthesisQueue = new Queue("synthesis", { connection: getRedis() });

// Configure queue event logging (debug: uncomment for verbose event tracking)
const queues = [uploadPdfQueue, embedChunksQueue, ocrQueue, synthesisQueue];

queues.forEach((queue) => {
  queue.on("error", (err) => {
    logger.error({ err, queue: queue.name }, "Queue error");
  });

  // Optional: log all job events for debugging
  // queue.on('added', (job) => logger.debug({ jobId: job.id, queue: queue.name }, 'Job added'));
  // queue.on('completed', (job) => logger.debug({ jobId: job.id, queue: queue.name }, 'Job completed'));
  // queue.on('failed', (job, err) => logger.error({ jobId: job.id, queue: queue.name, err }, 'Job failed'));
});

/**
 * Enqueue a job and return its ID. The route can optionally wait
 * for the job to complete (by polling) or return immediately.
 */
export async function enqueueJob(queue, data, options = {}) {
  const job = await queue.add(queue.name, data, {
    removeOnComplete: true, // auto-cleanup after 1 hour
    removeOnFail: false, // keep failures for debugging
    ...options,
  });
  logger.info({ jobId: job.id, queue: queue.name }, "Job enqueued");
  return job;
}

/**
 * Helper: wait for a job with exponential backoff polling.
 * Useful for quick jobs (OCR <5s) or when you need the result before responding.
 */
export async function waitForJob(job, maxWaitMs = 30000) {
  const startTime = Date.now();
  let pollIntervalMs = 100;

  while (Date.now() - startTime < maxWaitMs) {
    await job.reload();

    if (job.isCompleted()) {
      return job.data.result || job.returnvalue;
    }

    if (job.isFailed()) {
      throw new Error(`Job ${job.id} failed: ${job.failedReason}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    pollIntervalMs = Math.min(pollIntervalMs * 1.5, 2000); // cap at 2s
  }

  throw new Error(`Job ${job.id} did not complete within ${maxWaitMs}ms`);
}
