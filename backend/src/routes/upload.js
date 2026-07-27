import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import mongoose from "mongoose";
import { extractTextFromPdf } from "../services/pdfParser.js";
import { chunkPages } from "../services/chunker.js";
import { embedChunks } from "../services/embeddings.js";
import { getBucket } from "../db/mongoose.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadLimiter } from "../middleware/rateLimit.js";
import { sanitizeFilename } from "../utils/sanitizeFilename.js";
import Pdf from "../models/Pdf.js";
import Chunk from "../models/Chunk.js";
import ChatMessage from "../models/ChatMessage.js";
import logger from "../utils/logger.js";

const router = Router();

// Disk storage instead of memoryStorage: multer streams the incoming file
// straight to a temp file as bytes arrive off the network, rather than
// buffering the entire upload in Node's process memory. With memoryStorage,
// N concurrent uploads meant N full files (up to 20MB each) held in RAM
// simultaneously just from receiving the requests, before any processing
// even started. We still read the file into a Buffer once for pdf-parse
// (which requires one — see extractTextFromPdf), but only transiently,
// one file at a time within already-serialized processing, and the temp
// file is always removed afterward (success or failure) in the `finally`
// block below.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `study-assistant-upload-${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB cap
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") return cb(new Error("INVALID_FILE_TYPE"));
    cb(null, true);
  },
});

router.use(requireAuth);
router.use(uploadLimiter);

// True PDFs start with "%PDF-" — checking this (not just the client-reported
// MIME type, which is trivially spoofable by renaming any file to .pdf)
// catches files that were renamed rather than actually converted. This is
// a cheap first filter, not a full validity check — a file can pass this
// and still be a malformed/corrupted PDF, which is why the pdf-parse call
// below is wrapped in its own try/catch with a specific error message
// rather than falling through to a generic 500.
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

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF file was provided." });

  const tempPath = req.file.path;
  const filename = sanitizeFilename(req.file.originalname);
  let uploadStreamId = null;

  try {
    if (readMagicBytes(tempPath).toString("ascii") !== "%PDF-") {
      return res.status(400).json({ error: "This file doesn't look like a valid PDF. Please check the file and try again." });
    }

    const contentHash = await hashFile(tempPath);

    // Duplicate detection: same user re-uploading a file they already have
    // (whole-file hash, so a rename doesn't dodge this, but any byte-level
    // change — even re-saving from a different tool — will look like a new file).
    const existing = await Pdf.findOne({ owner: req.user.id, contentHash }).select("_id filename subject");
    if (existing) {
      return res.status(409).json({
        error: `You've already uploaded this file as "${existing.filename}".`,
        existingPdfId: existing._id,
      });
    }

    // pdf-parse needs a full Buffer (it doesn't accept a stream) — this is
    // the one point where the whole file is loaded into memory, but only for
    // as long as parsing/OCR/chunking/embedding takes, not for the entire
    // upload lifecycle, and it's released once this request finishes.
    let buffer;
    let pages, fullText, method;
    try {
      buffer = await fsp.readFile(tempPath);
      ({ pages, fullText, method } = await extractTextFromPdf(buffer, req.id));
    } catch (parseErr) {
      if (parseErr.code === "NO_EXTRACTABLE_TEXT") throw parseErr; // handled below with its own message
      // pdf-parse itself threw — the magic-byte check passed but the file's
      // internal structure is malformed/corrupted in a way the parser can't
      // recover from. Give a specific, clean error instead of a generic 500.
      logger.error({ reqId: req.id, err: parseErr }, "PDF parsing failed on a file that passed the magic-byte check");
      return res.status(400).json({
        error: "This PDF appears to be corrupted or isn't a valid PDF file. Please check the file and try again.",
      });
    }

    const rawChunks = chunkPages(pages); // [{ text, page }]
    const embeddings = await embedChunks(rawChunks.map((c) => c.text));

    // Store the original PDF bytes in MongoDB via GridFS ("cloud storage" for
    // the raw file), streaming directly from the temp file on disk rather
    // than from the in-memory buffer above.
    // GridFS writes aren't part of the transaction below (GridFS spans two
    // collections — fs.files/fs.chunks — and large multi-part uploads inside
    // a single transaction hit MongoDB's transaction size limits). Instead,
    // on any failure after this point, the GridFS file is explicitly deleted
    // as a compensating action, so a failed upload doesn't leave an orphaned
    // blob with no Pdf document pointing at it.
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, { contentType: "application/pdf" });
    uploadStreamId = uploadStream.id;
    await new Promise((resolve, reject) => {
      fs.createReadStream(tempPath).pipe(uploadStream).on("finish", resolve).on("error", reject);
    });

    const subject = (req.body.subject || "General").trim() || "General";

    // Pdf + its Chunk documents are created inside a transaction: if chunk
    // insertion fails partway through, the Pdf document it would have
    // belonged to is rolled back too, instead of leaving a Pdf with zero or
    // partial chunks that chat/search would silently treat as "no notes here".
    const session = await mongoose.startSession();
    let pdf;
    try {
      session.startTransaction();

      [pdf] = await Pdf.create(
        [
          {
            owner: req.user.id,
            filename,
            subject,
            extractionMethod: method,
            contentHash,
            gridFsFileId: uploadStream.id,
            fullText,
            chunkCount: rawChunks.length,
          },
        ],
        { session }
      );

      await Chunk.insertMany(
        rawChunks.map((c, i) => ({
          pdf: pdf._id,
          owner: req.user.id,
          subject,
          filename,
          page: c.page,
          text: c.text,
          embedding: embeddings[i],
        })),
        { session }
      );

      await session.commitTransaction();
    } catch (txErr) {
      await session.abortTransaction();
      throw txErr;
    } finally {
      session.endSession();
    }

    res.status(201).json({
      pdfId: pdf._id,
      filename: pdf.filename,
      subject: pdf.subject,
      extractionMethod: pdf.extractionMethod,
      chunkCount: rawChunks.length,
    });
  } catch (err) {
    // Compensating cleanup: the transaction (if it started) already rolled
    // back the Pdf/Chunk documents, but the GridFS file was written outside
    // it and needs removing explicitly so it doesn't become an orphan.
    if (uploadStreamId) {
      try {
        await getBucket().delete(uploadStreamId);
      } catch (cleanupErr) {
        logger.error({ reqId: req.id, err: cleanupErr }, "Failed to clean up orphaned GridFS file after a failed upload");
      }
    }

    if (err.code === "NO_EXTRACTABLE_TEXT") {
      return res.status(422).json({ error: err.message });
    }
    // Mongo duplicate-key error, e.g. a race between two simultaneous
    // uploads of the same file slipping past the findOne check above.
    if (err.code === 11000) {
      return res.status(409).json({ error: "You've already uploaded this file." });
    }
    logger.error({ reqId: req.id, err }, "Upload error");
    res.status(500).json({ error: "Something went wrong while processing this PDF. Please try again." });
  } finally {
    // Always clean up the temp file, regardless of success or failure —
    // this is the disk-storage equivalent of the buffer being garbage
    // collected, and without it temp files would accumulate on disk.
    fsp.unlink(tempPath).catch((cleanupErr) => {
      logger.error({ reqId: req.id, err: cleanupErr, tempPath }, "Failed to remove temp upload file");
    });
  }
});

router.get("/", async (req, res) => {
  const pdfs = await Pdf.find({ owner: req.user.id })
    .select("filename subject extractionMethod chunkCount uploadedAt")
    .sort({ uploadedAt: -1 });
  res.json({
    pdfs: pdfs.map((p) => ({
      id: p._id,
      filename: p.filename,
      subject: p.subject,
      extractionMethod: p.extractionMethod,
      uploadedAt: p.uploadedAt,
      chunkCount: p.chunkCount,
    })),
  });
});

// Streams the original PDF back (e.g. for an in-app viewer or re-download).
router.get("/:pdfId/file", async (req, res) => {
  const pdf = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!pdf) return res.status(404).json({ error: "PDF not found." });

  res.setHeader("Content-Type", "application/pdf");
  const bucket = getBucket();
  const downloadStream = bucket.openDownloadStream(pdf.gridFsFileId);
  downloadStream.on("error", (err) => {
    logger.error({ reqId: req.id, err }, "GridFS download error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't retrieve this file right now." });
    } else {
      res.end();
    }
  });
  downloadStream.pipe(res);
});

// Deletes a PDF: its GridFS file, its Mongo document, its chunks, and any
// chat history tied to it. Without this, storage only ever grows.
router.delete("/:pdfId", async (req, res) => {
  const pdf = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!pdf) return res.status(404).json({ error: "PDF not found." });

  try {
    const bucket = getBucket();
    await bucket.delete(pdf.gridFsFileId);
  } catch (err) {
    // Log and continue — a missing/already-gone GridFS file shouldn't block
    // removing the PDF record itself.
    logger.error({ reqId: req.id, err }, "GridFS delete error");
  }

  await Pdf.deleteOne({ _id: pdf._id });
  await Chunk.deleteMany({ pdf: pdf._id, owner: req.user.id });
  await ChatMessage.deleteMany({ pdf: pdf._id, owner: req.user.id });

  res.json({ ok: true });
});

export default router;
