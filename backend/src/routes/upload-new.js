import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import mongoose from "mongoose";
import { getBucket } from "../db/mongoose.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";
import { uploadPdfQueue, embedChunksQueue, synthesisQueue, enqueueJob, waitForJob } from "../services/queues.js";
import logger from "../utils/logger.js";
import Pdf from "../models/Pdf.js";
import ChatMessage from "../models/ChatMessage.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";

const router = Router();
router.param("pdfId", validateObjectIdParam);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `study-assistant-upload-${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("INVALID_FILE_TYPE"));
    cb(null, true);
  },
});

router.use(requireAuth);
router.use(uploadLimiter);

function readMagicBytes(filePath) {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(5);
  fs.readSync(fd, buf, 0, 5, 0);
  fs.closeSync(fd);
  return buf;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * POST /upload
 *
 * NEW (async-first): Enqueue PDF parsing + embeddings, return immediately with jobIds.
 *
 * Response: { pdfId, uploadJobId, embedJobId, synthesisJobId?, subject }
 *
 * The client polls /upload/:pdfId/status to track progress.
 * Once embedJobId completes, the PDF is ready for chat.
 */
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF file was provided." });

  const tempPath = req.file.path;
  const filename = sanitizeFilename(req.file.originalname);
  let uploadStreamId = null;

  try {
    // Validate it's actually a PDF
    if (readMagicBytes(tempPath).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ error: "This file doesn't look like a valid PDF. Please check the file and try again." });
    }

    const contentHash = await hashFile(tempPath);

    // Duplicate detection
    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already uploaded this file as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    // Read file into buffer (required by pdf-parse worker)
    const buffer = await fsp.readFile(tempPath);

    // Store PDF in GridFS
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType: "application/pdf" });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";
    const pdfDoc = new Pdf({
      owner: req.user.id,
      filename,
      subject,
      contentHash,
      gridFsId: uploadStreamId,
      processingStatus: "pending", // New field: pending -> parsing -> embedding -> ready
      pageCount: null, // Will be set by worker
      chunkCount: null, // Will be set by worker
    });

    const pdf = await pdfDoc.save();

    logger.info({ reqId: req.id, pdfId: pdf._id, filename }, "PDF created with pending status");

    // Enqueue jobs (in sequence via job options)
    const uploadJob = await enqueueJob(uploadPdfQueue, {
      fileBuffer: buffer,
      fileName: filename,
      userId: req.user.id.toString(),
      pdfId: pdf._id.toString(),
    });

    // Embed job waits for upload job to complete (via parent reference)
    const embedJob = await enqueueJob(embedChunksQueue, {
      pdfId: pdf._id.toString(),
      // text and pageCount will be copied from uploadJob result by worker
      // For now, mark them as pending
      textFromUploadJob: uploadJob.id,
    });

    // Optional: summary/flashcard synthesis (can run in parallel with embedding)
    let synthesisJobId = null;
    if (req.body.generateSummary === "true" || req.body.generateSummary === true) {
      const synthJob = await enqueueJob(synthesisQueue, {
        type: "summary",
        text: "", // Will be populated from PDF text
        pdfId: pdf._id.toString(),
        maxLength: 500,
      });
      synthesisJobId = synthJob.id;
    }

    // Immediately return success with job IDs
    // Client can poll the status endpoint to track progress
    return res.status(202).json({
      pdfId: pdf._id,
      uploadJobId: uploadJob.id,
      embedJobId: embedJob.id,
      synthesisJobId,
      subject,
      status: "pending",
      message: "PDF queued for processing. Check status endpoint for progress.",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Upload request failed");

    // Cleanup: delete orphaned GridFS file
    if (uploadStreamId) {
      try {
        const bucket = getBucket();
        await bucket.delete(uploadStreamId);
        logger.info({ uploadStreamId }, "Cleaned up orphaned GridFS file");
      } catch (cleanupErr) {
        logger.error({ uploadStreamId, err: cleanupErr }, "GridFS cleanup failed");
      }
    }

    throw err; // Central error handler
  } finally {
    // Always remove temp file
    try {
      await fsp.unlink(tempPath);
    } catch (_) {
      // Ignore if already removed
    }
  }
});

/**
 * GET /upload/:pdfId/status
 *
 * Poll to track PDF processing progress. Returns current state and job IDs.
 *
 * Response: { pdfId, processingStatus, uploadJob, embedJob, synthesisJob, chunksReady }
 */
router.get("/:pdfId/status", async (req, res) => {
  const pdf = await Pdf.findById(req.params.pdfId).select(
    "processingStatus pageCount chunkCount owner uploadJobId embedJobId synthesisJobId"
  );

  if (!pdf) return res.status(404).json({ error: "PDF not found" });
  if (pdf.owner.toString() !== req.user.id.toString()) return res.status(403).json({ error: "Forbidden" });

  // Fetch job status from Redis
  const [uploadJob, embedJob, synthesisJob] = await Promise.all([
    uploadPdfQueue.getJob(pdf.uploadJobId || ""),
    embedChunksQueue.getJob(pdf.embedJobId || ""),
    synthesisQueue.getJob(pdf.synthesisJobId || ""),
  ].map((p) => p.catch(() => null)));

  return res.json({
    pdfId: pdf._id,
    processingStatus: pdf.processingStatus,
    pageCount: pdf.pageCount,
    chunkCount: pdf.chunkCount,
    uploadJob: uploadJob
      ? {
          jobId: uploadJob.id,
          progress: uploadJob.progress?.value || 0,
          state: await uploadJob.getState(),
          failedReason: uploadJob.failedReason,
        }
      : null,
    embedJob: embedJob
      ? {
          jobId: embedJob.id,
          progress: embedJob.progress?.value || 0,
          state: await embedJob.getState(),
          failedReason: embedJob.failedReason,
        }
      : null,
    synthesisJob: synthesisJob
      ? {
          jobId: synthesisJob.id,
          progress: synthesisJob.progress?.value || 0,
          state: await synthesisJob.getState(),
          failedReason: synthesisJob.failedReason,
        }
      : null,
    chunksReady: pdf.processingStatus === "ready",
  });
});

// ... rest of existing routes (delete, list, etc.) remain unchanged

export default router;
