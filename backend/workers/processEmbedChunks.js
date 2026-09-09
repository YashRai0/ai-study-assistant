import crypto from "node:crypto";
import { chunkPages } from "../src/services/chunker.js";
import { embedChunks as embedChunkTexts } from "../src/services/embeddings.js";
import Pdf from "../src/models/Pdf.js";
import Chunk from "../src/models/Chunk.js";
import Source from "../src/models/Source.js";
import { learningQueue, enqueueJob } from "../src/services/queues.js";
import logger from "../src/utils/logger.js";

export function hashChunkText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Given this attempt's freshly-chunked text (each with a contentHash) and
 * whatever Chunk docs already exist for this PDF from a previous attempt,
 * decides which chunks need a new embedding vs. which can reuse one
 * unchanged. Pure and model-free (priorChunks is already-fetched plain
 * data) so it's unit-testable without a live Mongo connection — see
 * test/embeddingReuse.test.js.
 */
export function planEmbeddingReuse(rawChunks, priorChunks) {
  const priorByHash = new Map(
    (priorChunks || []).filter((c) => c.contentHash).map((c) => [c.contentHash, c])
  );
  const toEmbed = rawChunks.filter((c) => !priorByHash.has(c.contentHash));
  return { toEmbed, priorByHash };
}

export async function processEmbedChunks(job) {
  const { pdfId } = job.data;
  logger.info({ jobId: job.id, pdfId }, "Processing embeddings for PDF");

  const pdf = await Pdf.findById(pdfId).lean();
  if (!pdf) throw new Error("PDF record not found");
  if (!pdf.fullText) throw new Error("PDF has no extracted text");

  try {
    await job.updateProgress({ value: 10 });

    // Chunks whose text survived unchanged from a previous attempt at this
    // PDF (e.g. this job failed partway through and got retried) keep
    // their embedding rather than paying for the embedding model again —
    // that's the expensive part, not the small Chunk documents themselves.
    const priorChunks = await Chunk.find({ pdf: pdfId }).select("contentHash embedding").lean();

    // Note: the marker must match at the very start of the string too —
    // page 1's "--- Page 1 ---" has no leading newline (it's the first
    // thing in the string), unlike every later page's marker. A regex
    // that only matched "\n--- Page N ---\n" silently dropped page 1's
    // text from every multi-page PDF (verified: text.split(/\n--- Page
    // (\d+) ---\n/) never captures the segment before the first match).
    const pages = pdf.fullText.split(/(?:^|\n)--- Page (\d+) ---\n/);
    const pageTexts = [];
    if (pages.length > 1) {
      // pages[0] is now always "" (text before the first marker, which is
      // nothing since page 1's marker is at index 0) — start from i=1.
      for (let i = 1; i < pages.length; i += 2) pageTexts.push({ page: Number(pages[i]), text: pages[i + 1] || "" });
    } else {
      pageTexts.push({ page: 1, text: pdf.fullText });
    }

    const rawChunks = [];
    for (const page of pageTexts) {
      chunkPages([page.text]).forEach((c) => rawChunks.push({ ...c, page: page.page, contentHash: hashChunkText(c.text) }));
    }
    if (!rawChunks.length) throw new Error("No chunks generated from PDF text");
    await job.updateProgress({ value: 30 });

    const { toEmbed, priorByHash } = planEmbeddingReuse(rawChunks, priorChunks);
    const newEmbeddings = toEmbed.length ? await embedChunkTexts(toEmbed.map((c) => c.text)) : [];
    if (newEmbeddings.length !== toEmbed.length) throw new Error("Embedding count mismatch");
    const newEmbeddingByHash = new Map(toEmbed.map((c, idx) => [c.contentHash, newEmbeddings[idx]]));
    await job.updateProgress({ value: 80 });

    const docs = rawChunks.map((c) => ({
      pdf: pdf._id, owner: pdf.owner, subject: pdf.subject || "General", filename: pdf.filename,
      page: c.page, text: c.text, contentHash: c.contentHash,
      embedding: priorByHash.get(c.contentHash)?.embedding || newEmbeddingByHash.get(c.contentHash),
    }));

    // Chunk boundaries/order can still shift between attempts (chunker
    // logic changing, upstream text extraction differing slightly), so
    // this still replaces the full set — what retries now skip is
    // recomputing embeddings for text that didn't change, which is the
    // actual expensive step, not the delete+insert of small documents.
    await Chunk.deleteMany({ pdf: pdfId });
    await Chunk.insertMany(docs);
    await Pdf.findByIdAndUpdate(pdfId, { chunkCount: docs.length, processingStatus: "ready", processingError: null });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "ready" } });
    await job.updateProgress({ value: 100 });

    // Concept extraction is downstream of successful embedding so the
    // adaptive model is built only from a source that is actually usable.
    let learningJobId = null;
    if (pdf.course) {
      const learningJob = await enqueueJob(learningQueue, {
        courseId: String(pdf.course),
        sourcePdfId: String(pdfId),
      });
      learningJobId = String(learningJob.id);
      await Pdf.findByIdAndUpdate(pdfId, { learningJobId });
    }

    return { pdfId: String(pdfId), chunksCreated: docs.length, embeddingsGenerated: newEmbeddings.length, embeddingsReused: docs.length - newEmbeddings.length, learningJobId };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "Embedding job failed");
    throw err;
  }
}
