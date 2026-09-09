import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import { getBucket } from "../db/mongoose.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";
import { uploadPdfQueue, uploadDocxQueue, uploadPptxQueue, ingestYoutubeQueue, uploadAudioQueue, embedChunksQueue, synthesisQueue, learningQueue, enqueueJob } from "../services/queues.js";
import logger from "../utils/logger.js";
import Pdf from "../models/Pdf.js";
import Course from "../models/Course.js";
import Source from "../models/Source.js";
import Chunk from "../models/Chunk.js";
import ChatMessage from "../models/ChatMessage.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import { trackEvent } from "../services/analyticsService.js";

// Every /upload/* route below streams the file into GridFS before it
// validates courseId (the file has to exist somewhere to hash/parse it,
// and courseId is just a request field, not something worth blocking the
// upload on first). That means a course-not-found response after the
// GridFS write must clean that write up — an early `return` doesn't
// reach these routes' own catch-block cleanup (that only runs on a
// thrown error), so skipping this call here silently orphans the file's
// bytes in GridFS forever, never referenced by any Pdf document.
async function deleteOrphanedUpload(uploadStreamId) {
  if (!uploadStreamId) return;
  try {
    await getBucket().delete(uploadStreamId);
    logger.info({ uploadStreamId }, "Cleaned up orphaned GridFS file (course not found)");
  } catch (err) {
    logger.error({ uploadStreamId, err }, "GridFS cleanup failed");
  }
}

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

    // Store PDF in GridFS
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType: "application/pdf" });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";
    let courseId = req.body.courseId || null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, owner: req.user.id }).select("_id");
      if (!course) {
        await deleteOrphanedUpload(uploadStreamId);
        return res.status(404).json({ error: "Course not found." });
      }
    } else {
      const course = await Course.findOneAndUpdate(
        { owner: req.user.id, title: subject },
        { $setOnInsert: { owner: req.user.id, title: subject, subject } },
        { new: true, upsert: true }
      );
      courseId = course._id;
    }

    const pdfDoc = new Pdf({
      owner: req.user.id,
      course: courseId,
      filename,
      subject,
      contentHash,
      gridFsFileId: uploadStreamId,
      processingStatus: "pending", // New field: pending -> parsing -> embedding -> ready
      pageCount: null, // Will be set by worker
      chunkCount: 0, // Will be set by worker
    });

    const pdf = await pdfDoc.save();
    const source = await Source.create({
      owner: req.user.id,
      course: courseId,
      pdf: pdf._id,
      type: "pdf",
      title: filename,
      status: "processing",
      metadata: { subject },
    });

    logger.info({ reqId: req.id, pdfId: pdf._id, sourceId: source._id, filename }, "PDF created with pending status");

    // The worker reads the stored GridFS file by pdfId. Do not put the raw PDF
    // Buffer into BullMQ: job payloads are JSON-serialized and large binary
    // payloads create unnecessary Redis pressure.
    const uploadJob = await enqueueJob(uploadPdfQueue, {
      pdfId: pdf._id.toString(),
      fileName: filename,
    });

    pdf.uploadJobId = uploadJob.id;
    await pdf.save();

    await trackEvent(req.user.id, "pdf_uploaded", { pdfId: pdf._id, courseId });

    const synthesisJobId = null;

    // Immediately return success with job IDs
    // Client can poll the status endpoint to track progress
    return res.status(202).json({
      pdfId: pdf._id,
      courseId,
      sourceId: source._id,
      uploadJobId: uploadJob.id,
      embedJobId: null,
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

const uploadDocx = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `study-assistant-upload-${crypto.randomUUID()}.docx`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return cb(new Error("INVALID_FILE_TYPE"));
    }
    cb(null, true);
  },
});

/**
 * POST /upload/docx
 *
 * Same async-first pattern as POST /upload (PDF): enqueue parsing, return
 * immediately with jobIds, client polls /upload/:pdfId/status. Reuses the
 * Pdf model and the same status/polling endpoint below — see
 * docxParser.js's docstring for why that's safe (nothing downstream of
 * fullText cares which format produced it).
 *
 * Structurally parallel to POST / above rather than sharing a helper —
 * the two have genuinely different validation (magic bytes, mimetype) and
 * queue targets, and duplicating ~80 lines here is a smaller risk than
 * refactoring the working, already-relied-upon PDF path to share code
 * with a brand new, less-proven one.
 */
router.post("/docx", uploadDocx.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No DOCX file was provided." });

  const tempPath = req.file.path;
  const filename = sanitizeFilename(req.file.originalname);
  let uploadStreamId = null;

  try {
    // DOCX is a ZIP file under the hood — PK\x03\x04 is the standard ZIP
    // local-file-header signature, verified against a real generated
    // .docx file rather than assumed.
    if (readMagicBytes(tempPath).subarray(0, 4).toString("hex") !== "504b0304") {
      return res.status(400).json({ error: "This file doesn't look like a valid DOCX. Please check the file and try again." });
    }

    const contentHash = await hashFile(tempPath);

    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already uploaded this file as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";
    let courseId = req.body.courseId || null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, owner: req.user.id }).select("_id");
      if (!course) {
        await deleteOrphanedUpload(uploadStreamId);
        return res.status(404).json({ error: "Course not found." });
      }
    } else {
      const course = await Course.findOneAndUpdate(
        { owner: req.user.id, title: subject },
        { $setOnInsert: { owner: req.user.id, title: subject, subject } },
        { new: true, upsert: true }
      );
      courseId = course._id;
    }

    const pdfDoc = new Pdf({
      owner: req.user.id,
      course: courseId,
      filename,
      subject,
      contentHash,
      gridFsFileId: uploadStreamId,
      processingStatus: "pending",
      pageCount: null,
      chunkCount: 0,
    });

    const pdf = await pdfDoc.save();
    const source = await Source.create({
      owner: req.user.id,
      course: courseId,
      pdf: pdf._id,
      type: "docx",
      title: filename,
      status: "processing",
      metadata: { subject },
    });

    logger.info({ reqId: req.id, pdfId: pdf._id, sourceId: source._id, filename }, "DOCX created with pending status");

    const uploadJob = await enqueueJob(uploadDocxQueue, {
      pdfId: pdf._id.toString(),
      fileName: filename,
    });

    pdf.uploadJobId = uploadJob.id;
    await pdf.save();

    await trackEvent(req.user.id, "pdf_uploaded", { pdfId: pdf._id, courseId, format: "docx" });

    return res.status(202).json({
      pdfId: pdf._id,
      courseId,
      sourceId: source._id,
      uploadJobId: uploadJob.id,
      embedJobId: null,
      synthesisJobId: null,
      subject,
      status: "pending",
      message: "DOCX queued for processing. Check status endpoint for progress.",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "DOCX upload request failed");

    if (uploadStreamId) {
      try {
        const bucket = getBucket();
        await bucket.delete(uploadStreamId);
        logger.info({ uploadStreamId }, "Cleaned up orphaned GridFS file");
      } catch (cleanupErr) {
        logger.error({ uploadStreamId, err: cleanupErr }, "GridFS cleanup failed");
      }
    }

    throw err;
  } finally {
    try {
      await fsp.unlink(tempPath);
    } catch (_) {
      // Ignore if already removed
    }
  }
});

const uploadPptx = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `study-assistant-upload-${crypto.randomUUID()}.pptx`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
      return cb(new Error("INVALID_FILE_TYPE"));
    }
    cb(null, true);
  },
});

/**
 * POST /upload/pptx
 *
 * Structurally parallel to POST /upload/docx — see that route's comment
 * for why this isn't refactored into a shared helper with the PDF route.
 */
router.post("/pptx", uploadPptx.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PPTX file was provided." });

  const tempPath = req.file.path;
  const filename = sanitizeFilename(req.file.originalname);
  let uploadStreamId = null;

  try {
    // PPTX is also a ZIP file under the hood (same OOXML family as
    // DOCX) — PK\x03\x04 verified against a real generated .pptx file.
    if (readMagicBytes(tempPath).subarray(0, 4).toString("hex") !== "504b0304") {
      return res.status(400).json({ error: "This file doesn't look like a valid PPTX. Please check the file and try again." });
    }

    const contentHash = await hashFile(tempPath);

    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already uploaded this file as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";
    let courseId = req.body.courseId || null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, owner: req.user.id }).select("_id");
      if (!course) {
        await deleteOrphanedUpload(uploadStreamId);
        return res.status(404).json({ error: "Course not found." });
      }
    } else {
      const course = await Course.findOneAndUpdate(
        { owner: req.user.id, title: subject },
        { $setOnInsert: { owner: req.user.id, title: subject, subject } },
        { new: true, upsert: true }
      );
      courseId = course._id;
    }

    const pdfDoc = new Pdf({
      owner: req.user.id,
      course: courseId,
      filename,
      subject,
      contentHash,
      gridFsFileId: uploadStreamId,
      processingStatus: "pending",
      pageCount: null,
      chunkCount: 0,
    });

    const pdf = await pdfDoc.save();
    const source = await Source.create({
      owner: req.user.id,
      course: courseId,
      pdf: pdf._id,
      type: "pptx",
      title: filename,
      status: "processing",
      metadata: { subject },
    });

    logger.info({ reqId: req.id, pdfId: pdf._id, sourceId: source._id, filename }, "PPTX created with pending status");

    const uploadJob = await enqueueJob(uploadPptxQueue, {
      pdfId: pdf._id.toString(),
      fileName: filename,
    });

    pdf.uploadJobId = uploadJob.id;
    await pdf.save();

    await trackEvent(req.user.id, "pdf_uploaded", { pdfId: pdf._id, courseId, format: "pptx" });

    return res.status(202).json({
      pdfId: pdf._id,
      courseId,
      sourceId: source._id,
      uploadJobId: uploadJob.id,
      embedJobId: null,
      synthesisJobId: null,
      subject,
      status: "pending",
      message: "PPTX queued for processing. Check status endpoint for progress.",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "PPTX upload request failed");

    if (uploadStreamId) {
      try {
        const bucket = getBucket();
        await bucket.delete(uploadStreamId);
        logger.info({ uploadStreamId }, "Cleaned up orphaned GridFS file");
      } catch (cleanupErr) {
        logger.error({ uploadStreamId, err: cleanupErr }, "GridFS cleanup failed");
      }
    }

    throw err;
  } finally {
    try {
      await fsp.unlink(tempPath);
    } catch (_) {
      // Ignore if already removed
    }
  }
});

/**
 * POST /upload/youtube
 *
 * Same async job-queue pattern as file uploads, but there's no file to
 * receive — just a URL, fetched by the worker (processYoutubeIngest.js).
 * Duplicate detection hashes the extracted video ID rather than file
 * bytes, since there's no file here.
 *
 * Body: { videoUrl, subject?, courseId? }
 */
router.post("/youtube", async (req, res) => {
  const videoUrl = String(req.body.videoUrl || "").trim();
  if (!videoUrl) return res.status(400).json({ error: "videoUrl is required." });
  // Light sanity check only — real ID extraction/validation happens in
  // youtubeParser.js (via the library's own retrieveVideoId), which
  // throws a clear error the worker records as processingError if the
  // URL doesn't actually resolve to a valid video ID.
  if (!/youtube\.com|youtu\.be/i.test(videoUrl)) {
    return res.status(400).json({ error: "That doesn't look like a YouTube URL." });
  }

  try {
    const contentHash = crypto.createHash("sha256").update(`youtube:${videoUrl}`).digest("hex");

    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already added this video as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    const subject = (req.body.subject || "General").trim() || "General";
    let courseId = req.body.courseId || null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, owner: req.user.id }).select("_id");
      if (!course) return res.status(404).json({ error: "Course not found." });
    } else {
      const course = await Course.findOneAndUpdate(
        { owner: req.user.id, title: subject },
        { $setOnInsert: { owner: req.user.id, title: subject, subject } },
        { new: true, upsert: true }
      );
      courseId = course._id;
    }

    const filename = `YouTube: ${videoUrl}`;
    const pdfDoc = new Pdf({
      owner: req.user.id,
      course: courseId,
      filename,
      subject,
      contentHash,
      gridFsFileId: null, // no uploaded file — nothing stored in GridFS for this source
      processingStatus: "pending",
      pageCount: null,
      chunkCount: 0,
    });

    const pdf = await pdfDoc.save();
    const source = await Source.create({
      owner: req.user.id,
      course: courseId,
      pdf: pdf._id,
      type: "youtube",
      title: filename,
      status: "processing",
      metadata: { subject, videoUrl },
    });

    logger.info({ reqId: req.id, pdfId: pdf._id, sourceId: source._id, videoUrl }, "YouTube source created with pending status");

    const uploadJob = await enqueueJob(ingestYoutubeQueue, {
      pdfId: pdf._id.toString(),
      videoUrl,
    });

    pdf.uploadJobId = uploadJob.id;
    await pdf.save();

    await trackEvent(req.user.id, "pdf_uploaded", { pdfId: pdf._id, courseId, format: "youtube" });

    return res.status(202).json({
      pdfId: pdf._id,
      courseId,
      sourceId: source._id,
      uploadJobId: uploadJob.id,
      embedJobId: null,
      synthesisJobId: null,
      subject,
      status: "pending",
      message: "Video queued for transcript processing. Check status endpoint for progress.",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "YouTube ingest request failed");
    throw err;
  }
});

const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `study-assistant-upload-${crypto.randomUUID()}${file.originalname?.match(/\.\w+$/)?.[0] || ".audio"}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — longer than voice.js's 15MB cap, for lecture-length recordings
  fileFilter: (req, file, cb) => {
    const allowed = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/m4a", "audio/x-m4a"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("INVALID_FILE_TYPE"));
    cb(null, true);
  },
});

/**
 * POST /upload/audio
 *
 * Structurally parallel to POST /upload/docx and /upload/pptx — see
 * those routes' comments for why this isn't refactored into a shared
 * helper with the PDF route. No magic-bytes check here (unlike PDF/
 * DOCX/PPTX): audio container formats don't share one common signature
 * the way OOXML files (ZIP-based) do, so this relies on mimetype +
 * Whisper's own format handling to reject something unusable.
 */
router.post("/audio", uploadAudio.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio file was provided." });

  const tempPath = req.file.path;
  const filename = sanitizeFilename(req.file.originalname);
  let uploadStreamId = null;

  try {
    const contentHash = await hashFile(tempPath);

    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already uploaded this file as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType: req.file.mimetype });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";
    let courseId = req.body.courseId || null;
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, owner: req.user.id }).select("_id");
      if (!course) {
        await deleteOrphanedUpload(uploadStreamId);
        return res.status(404).json({ error: "Course not found." });
      }
    } else {
      const course = await Course.findOneAndUpdate(
        { owner: req.user.id, title: subject },
        { $setOnInsert: { owner: req.user.id, title: subject, subject } },
        { new: true, upsert: true }
      );
      courseId = course._id;
    }

    const pdfDoc = new Pdf({
      owner: req.user.id,
      course: courseId,
      filename,
      subject,
      contentHash,
      gridFsFileId: uploadStreamId,
      processingStatus: "pending",
      pageCount: null,
      chunkCount: 0,
    });

    const pdf = await pdfDoc.save();
    const source = await Source.create({
      owner: req.user.id,
      course: courseId,
      pdf: pdf._id,
      type: "audio",
      title: filename,
      status: "processing",
      metadata: { subject },
    });

    logger.info({ reqId: req.id, pdfId: pdf._id, sourceId: source._id, filename }, "Audio created with pending status");

    const uploadJob = await enqueueJob(uploadAudioQueue, {
      pdfId: pdf._id.toString(),
      fileName: filename,
    });

    pdf.uploadJobId = uploadJob.id;
    await pdf.save();

    await trackEvent(req.user.id, "pdf_uploaded", { pdfId: pdf._id, courseId, format: "audio" });

    return res.status(202).json({
      pdfId: pdf._id,
      courseId,
      sourceId: source._id,
      uploadJobId: uploadJob.id,
      embedJobId: null,
      synthesisJobId: null,
      subject,
      status: "pending",
      message: "Audio queued for transcription. Check status endpoint for progress.",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Audio upload request failed");

    if (uploadStreamId) {
      try {
        const bucket = getBucket();
        await bucket.delete(uploadStreamId);
        logger.info({ uploadStreamId }, "Cleaned up orphaned GridFS file");
      } catch (cleanupErr) {
        logger.error({ uploadStreamId, err: cleanupErr }, "GridFS cleanup failed");
      }
    }

    throw err;
  } finally {
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
    "processingStatus pageCount chunkCount owner uploadJobId embedJobId synthesisJobId learningJobId"
  );

  if (!pdf) return res.status(404).json({ error: "PDF not found" });
  if (pdf.owner.toString() !== req.user.id.toString()) return res.status(403).json({ error: "Forbidden" });

  // Fetch job status from Redis
  const [uploadJob, embedJob, synthesisJob, learningJob] = await Promise.all([
    uploadPdfQueue.getJob(pdf.uploadJobId || ""),
    embedChunksQueue.getJob(pdf.embedJobId || ""),
    synthesisQueue.getJob(pdf.synthesisJobId || ""),
    learningQueue.getJob(pdf.learningJobId || ""),
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
    learningJob: learningJob
      ? {
          jobId: learningJob.id,
          progress: learningJob.progress?.value || 0,
          state: await learningJob.getState(),
          failedReason: learningJob.failedReason,
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

router.get("/", async (req, res) => {
  const pdfs = await Pdf.find({ owner: req.user.id })
    .select("filename subject extractionMethod chunkCount uploadedAt processingStatus course")
    .sort({ uploadedAt: -1 });
  res.json({
    pdfs: pdfs.map((p) => ({
      id: p._id,
      filename: p.filename,
      subject: p.subject,
      extractionMethod: p.extractionMethod,
      uploadedAt: p.uploadedAt,
      chunkCount: p.chunkCount,
      processingStatus: p.processingStatus,
      courseId: p.course,
    })),
  });
});

router.get("/:pdfId/file", async (req, res) => {
  const pdf = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!pdf) return res.status(404).json({ error: "PDF not found." });
  if (!pdf.gridFsFileId) {
    return res.status(404).json({ error: "This source has no downloadable original file (e.g. it was added from a URL, not uploaded)." });
  }
  res.setHeader("Content-Type", "application/pdf");
  const downloadStream = getBucket().openDownloadStream(pdf.gridFsFileId);
  downloadStream.on("error", (err) => {
    logger.error({ reqId: req.id, err }, "GridFS download error");
    if (!res.headersSent) res.status(500).json({ error: "Couldn't retrieve this file right now." });
    else res.end();
  });
  downloadStream.pipe(res);
});

router.delete("/:pdfId", async (req, res) => {
  const pdf = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!pdf) return res.status(404).json({ error: "PDF not found." });
  if (pdf.gridFsFileId) {
    try { await getBucket().delete(pdf.gridFsFileId); } catch (err) { logger.error({ reqId: req.id, err }, "GridFS delete error"); }
  }
  await Promise.all([
    Pdf.deleteOne({ _id: pdf._id }),
    Chunk.deleteMany({ pdf: pdf._id, owner: req.user.id }),
    ChatMessage.deleteMany({ pdf: pdf._id, owner: req.user.id }),
    Source.deleteMany({ pdf: pdf._id, owner: req.user.id }),
  ]);
  res.json({ ok: true });
});

export default router;
