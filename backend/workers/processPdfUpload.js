import { Readable } from "stream";
import pdfParse from "pdf-parse";
import { logger } from "../src/services/logger.js";

/**
 * Worker: Process PDF upload
 *
 * Input: { fileBuffer, fileName, userId, pdfId }
 * Output: { text, pageCount, metadata }
 *
 * This runs once per PDF upload. On success, triggers embedChunksQueue.
 * On failure, the PDF job is marked failed and user is notified.
 */
export async function processPdfUpload(job) {
  const { fileBuffer, fileName, userId, pdfId } = job.data;
  logger.info({ jobId: job.id, pdfId, fileName }, "Processing PDF upload");

  try {
    // Validate input
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error("Invalid file buffer");
    }
    if (!pdfId) {
      throw new Error("Missing pdfId");
    }

    // Parse PDF metadata and text
    const pdfData = await pdfParse(fileBuffer);
    const { text, numpages, info } = pdfData;

    // Validate extraction
    if (!text || text.trim().length === 0) {
      throw new Error("PDF has no extractable text (may be image-only; use OCR)");
    }

    if (numpages > 500) {
      logger.warn({ pdfId, pageCount: numpages }, "PDF exceeds 500 pages; may slow down processing");
    }

    const result = {
      text: text.trim(),
      pageCount: numpages,
      metadata: {
        title: info?.Title || fileName,
        author: info?.Author || null,
        subject: info?.Subject || null,
        creationDate: info?.CreationDate || null,
      },
    };

    logger.info({ jobId: job.id, pdfId, pageCount: numpages, textLength: text.length }, "PDF upload succeeded");
    return result;
  } catch (err) {
    logger.error({ jobId: job.id, pdfId, err }, "PDF upload failed");
    throw err;
  }
}
