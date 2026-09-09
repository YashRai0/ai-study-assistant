import Pdf from "../src/models/Pdf.js";
import Source from "../src/models/Source.js";
import { getBucket } from "../src/db/mongoose.js";
import { embedChunksQueue, enqueueJob } from "../src/services/queues.js";
import { extractTextFromPdf } from "../src/services/pdfParser.js";
import logger from "../src/utils/logger.js";

async function readGridFsFile(fileId) {
  const bucket = getBucket();
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function processPdfUpload(job) {
  const { pdfId, fileName } = job.data;
  logger.info({ jobId: job.id, pdfId, fileName }, "Processing PDF upload");

  const pdf = await Pdf.findById(pdfId);
  if (!pdf) throw new Error("PDF record not found");

  try {
    await job.updateProgress({ value: 10 });
    const buffer = await readGridFsFile(pdf.gridFsFileId);
    if (!buffer.length) throw new Error("Stored PDF is empty");
    await job.updateProgress({ value: 30 });

    // extractTextFromPdf already handles: per-page text capture via
    // pdf-parse's pagerender callback, an OCR fallback for scanned/
    // image-only PDFs (this worker previously had no OCR fallback at
    // all — it would fail permanently on any scanned PDF with a message
    // telling the user to "use OCR", which nothing then did), and a
    // page-count cap + timeout on the OCR path. Reusing it here instead
    // of re-implementing PDF parsing avoids duplicating (and diverging
    // from) that already-tested logic.
    const { pages, fullText: rawText, method } = await extractTextFromPdf(buffer, job.id);
    await job.updateProgress({ value: 80 });
    const pageTexts = pages.map((t) => t.trim()).filter(Boolean);
    const text = pageTexts.length > 1
      ? pageTexts.map((page, index) => `--- Page ${index + 1} ---\n${page}`).join("\n")
      : rawText;

    await Pdf.findByIdAndUpdate(pdfId, {
      fullText: text,
      pageCount: pageTexts.length || 1,
      extractionMethod: method,
      processingStatus: "parsing_complete",
      processingError: null,
    });
    await Source.updateOne({ pdf: pdfId }, { $set: { metadata: { pageCount: pageTexts.length || 1 } } });

    const embedJob = await enqueueJob(embedChunksQueue, { pdfId: String(pdfId) });
    await Pdf.findByIdAndUpdate(pdfId, { embedJobId: String(embedJob.id) });
    await job.updateProgress({ value: 100 });

    logger.info({ jobId: job.id, pdfId, pageCount: pageTexts.length, method, embedJobId: embedJob.id }, "PDF parsed; embedding queued");
    return { pdfId: String(pdfId), pageCount: pageTexts.length, method, textLength: text.length, embedJobId: String(embedJob.id) };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "PDF upload failed");
    throw err;
  }
}
