import { Queue } from "bullmq";
import { getRedis } from "./redis.js";
import logger from "../utils/logger.js";
import { retryStrategies } from "./jobRetry.js";

/**
 * BullMQ Queues for async background jobs.
 *
 * Job names follow pattern: "PDF upload" → uploadPdf queue
 * Data schema validated by each worker.
 */

// PDF parsing: extract text, metadata, page count from raw PDF file
export const uploadPdfQueue = new Queue("uploadPdf", { connection: getRedis() });

// DOCX parsing: extract text via mammoth, then hand off to the same
// embedChunksQueue pipeline PDF uses — see workers/processDocxUpload.js.
export const uploadDocxQueue = new Queue("uploadDocx", { connection: getRedis() });

// PPTX parsing: extract slide text, then the same embedChunksQueue
// pipeline — see workers/processPptxUpload.js.
export const uploadPptxQueue = new Queue("uploadPptx", { connection: getRedis() });

// YouTube: fetch + normalize a video's transcript, then the same
// embedChunksQueue pipeline — see workers/processYoutubeIngest.js.
export const ingestYoutubeQueue = new Queue("ingestYoutube", { connection: getRedis() });

// Audio: transcribe via Whisper, then the same embedChunksQueue pipeline
// — see workers/processAudioUpload.js.
export const uploadAudioQueue = new Queue("uploadAudio", { connection: getRedis() });

// Chunking & embedding: split text into semantic chunks, generate embeddings
export const embedChunksQueue = new Queue("embedChunks", { connection: getRedis() });

// OCR: extract text from scanned PDF pages
export const ocrQueue = new Queue("ocr", { connection: getRedis() });

// Text synthesis: generate summaries, flashcards, study guides via LLM
export const synthesisQueue = new Queue("synthesis", { connection: getRedis() });

// Adaptive-learning jobs: concept extraction and diagnostic question generation.
export const learningQueue = new Queue("learning", { connection: getRedis() });
export const learningEventQueue = new Queue("learningEvent", { connection: getRedis() });

// Configure queue event logging (debug: uncomment for verbose event tracking)
export const ALL_QUEUES = [uploadPdfQueue, uploadDocxQueue, uploadPptxQueue, ingestYoutubeQueue, uploadAudioQueue, embedChunksQueue, ocrQueue, synthesisQueue, learningQueue, learningEventQueue];

ALL_QUEUES.forEach((queue) => {
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
  const strategy = retryStrategies[queue.name] || {};
  const attempts = options.attempts ?? strategy.maxAttempts ?? 1;
  const backoffType = options.backoff?.type || (strategy.backoffStrategy || "exponential");
  const jobOptions = {
    attempts,
    backoff: options.backoff || (attempts > 1 ? { type: backoffType, delay: 1000 } : undefined),
    removeOnComplete: options.removeOnComplete ?? strategy.removeOnComplete ?? { age: 3600 },
    removeOnFail: options.removeOnFail ?? strategy.removeOnFail ?? false,
    ...options,
  };
  const job = await queue.add(queue.name, data, jobOptions);
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
