import Pdf from "../src/models/Pdf.js";
import Source from "../src/models/Source.js";
import { getBucket } from "../src/db/mongoose.js";
import { embedChunksQueue, enqueueJob } from "../src/services/queues.js";
import { extractTextFromDocx } from "../src/services/docxParser.js";
import logger from "../src/utils/logger.js";

async function readGridFsFile(fileId) {
  const bucket = getBucket();
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Mirrors processPdfUpload.js exactly past the extraction step — same Pdf
// document, same processingStatus lifecycle, same embedChunksQueue
// hand-off. The `Pdf` model stores extracted text generically enough
// (despite its name) that reusing it here means every downstream feature
// (chunking, embeddings, concept extraction, chat, quiz, exam readiness)
// works for DOCX with zero changes — see extractTextFromDocx's docstring.
export async function processDocxUpload(job) {
  const { pdfId, fileName } = job.data;
  logger.info({ jobId: job.id, pdfId, fileName }, "Processing DOCX upload");

  const pdf = await Pdf.findById(pdfId);
  if (!pdf) throw new Error("Document record not found");

  try {
    await job.updateProgress({ value: 10 });
    const buffer = await readGridFsFile(pdf.gridFsFileId);
    if (!buffer.length) throw new Error("Stored DOCX is empty");
    await job.updateProgress({ value: 40 });

    const { fullText, method } = await extractTextFromDocx(buffer, job.id);
    await job.updateProgress({ value: 80 });

    await Pdf.findByIdAndUpdate(pdfId, {
      fullText,
      pageCount: 1, // DOCX has no natural page boundary at the text-extraction stage
      extractionMethod: method,
      processingStatus: "parsing_complete",
      processingError: null,
    });
    await Source.updateOne({ pdf: pdfId }, { $set: { metadata: { format: "docx" } } });

    const embedJob = await enqueueJob(embedChunksQueue, { pdfId: String(pdfId) });
    await Pdf.findByIdAndUpdate(pdfId, { embedJobId: String(embedJob.id) });
    await job.updateProgress({ value: 100 });

    logger.info({ jobId: job.id, pdfId, textLength: fullText.length, embedJobId: embedJob.id }, "DOCX parsed; embedding queued");
    return { pdfId: String(pdfId), method, textLength: fullText.length, embedJobId: String(embedJob.id) };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "DOCX upload failed");
    throw err;
  }
}
