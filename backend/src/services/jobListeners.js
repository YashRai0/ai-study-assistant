/**
 * Job Event Handlers
 *
 * Listen for queue events and update database state accordingly.
 * This decouples the worker from database updates via pub/sub.
 *
 * In production, consider moving this to a separate microservice/listener
 * that connects to Redis and watches queues independently.
 */

import { uploadPdfQueue, embedChunksQueue, synthesisQueue } from "./queues.js";
import Pdf from "../models/Pdf.js";
import logger from "../utils/logger.js";

/**
 * Attach all BullMQ queue event listeners.
 */
export function attachJobListeners() {
  /**
   * PDF upload completed
   */
  uploadPdfQueue.on("completed", async (job) => {
    try {
      const { pdfId, pageCount } = job.returnvalue || {};

      if (pdfId) {
        await Pdf.findByIdAndUpdate(pdfId, {
          pageCount,
          processingStatus: "parsing_complete",
        });

        logger.info(
          { jobId: job.id, pdfId, pageCount },
          "PDF parsing complete; updating status"
        );
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, err },
        "Failed to update PDF status after upload completion"
      );
    }
  });

  /**
   * PDF upload failed
   */
  uploadPdfQueue.on("failed", async (job) => {
    try {
      const { pdfId } = job.data || {};

      if (pdfId) {
        await Pdf.findByIdAndUpdate(pdfId, {
          processingStatus: "failed",
          processingError: job.failedReason,
        });

        logger.warn(
          { jobId: job.id, pdfId, reason: job.failedReason },
          "PDF parsing failed"
        );
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, err },
        "Failed to update PDF status after upload failure"
      );
    }
  });

  /**
   * Embedding completed
   */
  embedChunksQueue.on("completed", async (job) => {
    try {
      const { pdfId, chunksCreated } = job.returnvalue || {};

      if (pdfId) {
        await Pdf.findByIdAndUpdate(pdfId, {
          chunkCount: chunksCreated,
          processingStatus: "ready",
        });

        logger.info(
          { jobId: job.id, pdfId, chunksCreated },
          "Embeddings complete; PDF ready"
        );
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, err },
        "Failed to update PDF status after embedding completion"
      );
    }
  });

  /**
   * Embedding failed
   */
  embedChunksQueue.on("failed", async (job) => {
    try {
      const { pdfId } = job.data || {};

      if (pdfId) {
        await Pdf.findByIdAndUpdate(pdfId, {
          processingStatus: "failed",
          processingError: job.failedReason,
        });

        logger.warn(
          { jobId: job.id, pdfId, reason: job.failedReason },
          "Embedding job failed"
        );
      }
    } catch (err) {
      logger.error(
        { jobId: job.id, err },
        "Failed to update PDF status after embedding failure"
      );
    }
  });

  /**
   * AI synthesis completed
   */
  synthesisQueue.on("completed", async (job) => {
    logger.info(
      { jobId: job.id, type: job.data?.type },
      "Synthesis job completed"
    );
  });

  /**
   * AI synthesis failed
   */
  synthesisQueue.on("failed", async (job) => {
    logger.warn(
      {
        jobId: job.id,
        type: job.data?.type,
        reason: job.failedReason,
      },
      "Synthesis job failed"
    );
  });

  logger.info("Job event listeners attached");
}