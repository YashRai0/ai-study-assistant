import Pdf from "../src/models/Pdf.js";
import Source from "../src/models/Source.js";
import { getBucket } from "../src/db/mongoose.js";
import { embedChunksQueue, enqueueJob } from "../src/services/queues.js";
import { extractTextFromAudio } from "../src/services/audioParser.js";
import logger from "../src/utils/logger.js";

async function readGridFsFile(fileId) {
  const bucket = getBucket();
  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(fileId)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function processAudioUpload(job) {
  const { pdfId, fileName } = job.data;
  logger.info({ jobId: job.id, pdfId, fileName }, "Processing audio upload");

  const pdf = await Pdf.findById(pdfId);
  if (!pdf) throw new Error("Document record not found");

  try {
    await job.updateProgress({ value: 10 });
    const buffer = await readGridFsFile(pdf.gridFsFileId);
    if (!buffer.length) throw new Error("Stored audio file is empty");
    await job.updateProgress({ value: 30 });

    const { fullText, method } = await extractTextFromAudio(buffer, fileName);
    await job.updateProgress({ value: 90 });

    await Pdf.findByIdAndUpdate(pdfId, {
      fullText,
      pageCount: 1,
      extractionMethod: method,
      processingStatus: "parsing_complete",
      processingError: null,
    });
    await Source.updateOne({ pdf: pdfId }, { $set: { metadata: { format: "audio" } } });

    const embedJob = await enqueueJob(embedChunksQueue, { pdfId: String(pdfId) });
    await Pdf.findByIdAndUpdate(pdfId, { embedJobId: String(embedJob.id) });
    await job.updateProgress({ value: 100 });

    logger.info({ jobId: job.id, pdfId, textLength: fullText.length, embedJobId: embedJob.id }, "Audio transcribed; embedding queued");
    return { pdfId: String(pdfId), method, textLength: fullText.length, embedJobId: String(embedJob.id) };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "Audio upload failed");
    throw err;
  }
}
