import Tesseract from "tesseract.js";
import { logger } from "../src/services/logger.js";

/**
 * Worker: Extract text via OCR from scanned PDF pages
 *
 * Input: { images: [{ pageNum, base64 }, ...], pdfId, lang = 'eng' }
 * Output: { ocrPageResults: [{ pageNum, text, confidence }, ...], totalText }
 *
 * Tesseract.js processes images sequentially (GPU-accelerated if available).
 * Large PDFs (100+ pages) may take 1-2 minutes. Consider progressive feedback
 * in production via job.progress().
 */
export async function processOcr(job) {
  const { images, pdfId, lang = "eng" } = job.data;
  logger.info({ jobId: job.id, pdfId, imageCount: images.length }, "Starting OCR");

  try {
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error("No images provided for OCR");
    }

    if (images.length > 500) {
      logger.warn({ pdfId, imageCount: images.length }, "OCR job has 500+ pages; may take 10+ minutes");
    }

    const ocrPageResults = [];
    let totalText = "";

    for (const [idx, image] of images.entries()) {
      try {
        const { pageNum, base64 } = image;

        // Initialize Tesseract worker per image to avoid memory leak
        const worker = await Tesseract.createWorker(lang);

        const result = await worker.recognize(`data:image/png;base64,${base64}`);
        const pageText = result.data.text || "";

        ocrPageResults.push({
          pageNum,
          text: pageText.trim(),
          confidence: result.data.confidence || 0,
        });

        totalText += `\n--- Page ${pageNum} ---\n${pageText}`;

        await worker.terminate();

        // Progress callback for long jobs
        const progress = Math.round(((idx + 1) / images.length) * 100);
        job.progress(progress);

        logger.debug(
          { jobId: job.id, pdfId, pageNum, confidence: result.data.confidence },
          "OCR page completed"
        );
      } catch (pageErr) {
        logger.warn({ jobId: job.id, pdfId, pageNum: image.pageNum, err: pageErr }, "OCR page failed; skipping");
        ocrPageResults.push({
          pageNum: image.pageNum,
          text: "",
          confidence: 0,
          error: pageErr.message,
        });
      }
    }

    if (totalText.trim().length === 0) {
      throw new Error("OCR produced no extractable text from any page");
    }

    logger.info(
      { jobId: job.id, pdfId, pagesProcessed: ocrPageResults.length, totalTextLength: totalText.length },
      "OCR completed"
    );

    return {
      ocrPageResults,
      totalText: totalText.trim(),
    };
  } catch (err) {
    logger.error({ jobId: job.id, pdfId, err }, "OCR job failed");
    throw err;
  }
}
