import { Router } from "express";
import { uploadPdfQueue, embedChunksQueue, ocrQueue, synthesisQueue } from "../services/queues.js";
import { requireAuth } from "../middleware/auth.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);

/**
 * Admin-only monitoring dashboard data
 *
 * GET /api/v1/admin/queue-status
 *
 * Returns current state of all BullMQ queues (job counts, recent jobs, errors)
 * TODO: Add role-based access control (admin-only)
 */
router.get("/queue-status", async (req, res) => {
  // TODO: Check if req.user is admin
  // For now, allow any authenticated user (since this is internal-only)

  try {
    const queues = [
      { queue: uploadPdfQueue, name: "uploadPdf" },
      { queue: embedChunksQueue, name: "embedChunks" },
      { queue: ocrQueue, name: "ocr" },
      { queue: synthesisQueue, name: "synthesis" },
    ];

    const status = {};

    for (const { queue, name } of queues) {
      const counts = await queue.getJobCounts();
      const failedJobs = await queue.getFailed(0, 10); // Last 10 failed
      const recentJobs = await queue.getCompletedCount(); // Total completed

      status[name] = {
        counts,
        failedJobCount: failedJobs.length,
        recentFailures: failedJobs.slice(0, 3).map((job) => ({
          id: job.id,
          failedReason: job.failedReason,
          failedAt: job.failedTimestamp,
          attempts: job.attemptsMade,
        })),
        totalCompleted: recentJobs,
      };
    }

    res.json(status);
  } catch (err) {
    logger.error({ err }, "Failed to fetch queue status");
    res.status(500).json({ error: "Could not fetch queue status" });
  }
});

/**
 * Get a single job's details
 *
 * GET /api/v1/admin/job/:jobId
 */
router.get("/job/:jobId", async (req, res) => {
  const { jobId } = req.params;

  try {
    const allQueues = [uploadPdfQueue, embedChunksQueue, ocrQueue, synthesisQueue];

    for (const queue of allQueues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        return res.json({
          id: job.id,
          queue: queue.name,
          state,
          progress: job.progress?.value || 0,
          data: job.data,
          result: job.returnvalue,
          failedReason: job.failedReason,
          attempts: job.attemptsMade,
          stacktrace: job.stacktrace?.[0] || null,
        });
      }
    }

    res.status(404).json({ error: "Job not found" });
  } catch (err) {
    logger.error({ err }, "Failed to fetch job");
    res.status(500).json({ error: "Could not fetch job" });
  }
});

/**
 * Retry a failed job
 *
 * POST /api/v1/admin/job/:jobId/retry
 */
router.post("/job/:jobId/retry", async (req, res) => {
  const { jobId } = req.params;

  try {
    const allQueues = [uploadPdfQueue, embedChunksQueue, ocrQueue, synthesisQueue];

    for (const queue of allQueues) {
      const job = await queue.getJob(jobId);
      if (job) {
        const state = await job.getState();
        if (state !== "failed") {
          return res.status(400).json({ error: "Job is not in failed state" });
        }

        await job.retry("failed");
        logger.info({ jobId }, "Job retried");
        return res.json({ ok: true, message: "Job queued for retry" });
      }
    }

    res.status(404).json({ error: "Job not found" });
  } catch (err) {
    logger.error({ err }, "Failed to retry job");
    res.status(500).json({ error: "Could not retry job" });
  }
});

/**
 * Drain all queues (for maintenance)
 *
 * POST /api/v1/admin/drain-queues
 *
 * ⚠️  WARNING: This will remove all pending and delayed jobs!
 */
router.post("/drain-queues", async (req, res) => {
  // TODO: Add confirmation token or require specific header
  try {
    const allQueues = [uploadPdfQueue, embedChunksQueue, ocrQueue, synthesisQueue];

    for (const queue of allQueues) {
      await queue.drain();
      logger.warn({ queue: queue.name }, "Queue drained (MAINTENANCE)");
    }

    res.json({ ok: true, message: "All queues drained" });
  } catch (err) {
    logger.error({ err }, "Failed to drain queues");
    res.status(500).json({ error: "Could not drain queues" });
  }
});

export default router;
