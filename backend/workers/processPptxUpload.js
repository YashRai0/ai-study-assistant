import Pdf from "../src/models/Pdf.js";
import Source from "../src/models/Source.js";
import { getBucket } from "../src/db/mongoose.js";
import { embedChunksQueue, enqueueJob } from "../src/services/queues.js";
import { extractTextFromPptx } from "../src/services/pptxParser.js";
import logger from "../src/utils/logger.js";

async function readGridFsFile(fileId) {
  const bucket = getBucket();
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Mirrors processDocxUpload.js exactly past the extraction step — same
// Pdf document reuse rationale applies (see docxParser.js's docstring).
export async function processPptxUpload(job) {
  const { pdfId, fileName } = job.data;
  logger.info({ jobId: job.id, pdfId, fileName }, "Processing PPTX upload");

  const pdf = await Pdf.findById(pdfId);
  if (!pdf) throw new Error("Document record not found");

  try {
    await job.updateProgress({ value: 10 });
    const buffer = await readGridFsFile(pdf.gridFsFileId);
    if (!buffer.length) throw new Error("Stored PPTX is empty");
    await job.updateProgress({ value: 40 });

    const { pages, fullText, method } = await extractTextFromPptx(buffer, job.id);
    await job.updateProgress({ value: 80 });

    await Pdf.findByIdAndUpdate(pdfId, {
      fullText,
      pageCount: pages.length, // one "page" per slide — a real, meaningful count for PPTX, unlike DOCX
      extractionMethod: method,
      processingStatus: "parsing_complete",
      processingError: null,
    });
    await Source.updateOne({ pdf: pdfId }, { $set: { metadata: { format: "pptx", slideCount: pages.length } } });

    const embedJob = await enqueueJob(embedChunksQueue, { pdfId: String(pdfId) });
    await Pdf.findByIdAndUpdate(pdfId, { embedJobId: String(embedJob.id) });
    await job.updateProgress({ value: 100 });

    logger.info({ jobId: job.id, pdfId, slideCount: pages.length, embedJobId: embedJob.id }, "PPTX parsed; embedding queued");
    return { pdfId: String(pdfId), method, slideCount: pages.length, embedJobId: String(embedJob.id) };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "PPTX upload failed");
    throw err;
  }
}
