import Pdf from "../src/models/Pdf.js";
import Source from "../src/models/Source.js";
import { embedChunksQueue, enqueueJob } from "../src/services/queues.js";
import { extractTranscriptFromYouTube } from "../src/services/youtubeParser.js";
import logger from "../src/utils/logger.js";

// Same downstream reuse rationale as processDocxUpload.js/
// processPptxUpload.js, but no GridFS step — there's no uploaded file
// here, `videoUrl` is fetched directly from YouTube.
export async function processYoutubeIngest(job) {
  const { pdfId, videoUrl } = job.data;
  logger.info({ jobId: job.id, pdfId, videoUrl }, "Processing YouTube ingest");

  const pdf = await Pdf.findById(pdfId);
  if (!pdf) throw new Error("Document record not found");

  try {
    await job.updateProgress({ value: 20 });
    const { pages, fullText, method } = await extractTranscriptFromYouTube(videoUrl);
    await job.updateProgress({ value: 80 });

    await Pdf.findByIdAndUpdate(pdfId, {
      fullText,
      pageCount: pages.length,
      extractionMethod: method,
      processingStatus: "parsing_complete",
      processingError: null,
    });
    await Source.updateOne({ pdf: pdfId }, { $set: { metadata: { format: "youtube", videoUrl } } });

    const embedJob = await enqueueJob(embedChunksQueue, { pdfId: String(pdfId) });
    await Pdf.findByIdAndUpdate(pdfId, { embedJobId: String(embedJob.id) });
    await job.updateProgress({ value: 100 });

    logger.info({ jobId: job.id, pdfId, pageCount: pages.length, embedJobId: embedJob.id }, "YouTube transcript parsed; embedding queued");
    return { pdfId: String(pdfId), method, pageCount: pages.length, embedJobId: String(embedJob.id) };
  } catch (err) {
    await Pdf.findByIdAndUpdate(pdfId, { processingStatus: "failed", processingError: err.message });
    await Source.updateOne({ pdf: pdfId }, { $set: { status: "failed", metadata: { error: err.message } } });
    logger.error({ jobId: job.id, pdfId, err }, "YouTube ingest failed");
    throw err;
  }
}
