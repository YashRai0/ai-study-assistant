import pdfParse from "pdf-parse";
import { ocrPdfBuffer } from "./ocr.js";
import logger from "../utils/logger.js";

const MIN_TEXT_LENGTH = 50; // below this, assume the PDF is scanned/image-only

// OCR is CPU-intensive (rasterize + recognize, per page). Without a cap, a
// malicious or just very large image-heavy PDF could tie up the server for
// a long time — this bounds the worst case. A legitimate scanned textbook
// chapter is well under this; a 500-page scanned book is not what this
// feature is meant to process synchronously in one HTTP request.
const MAX_OCR_PAGES = 30;
const OCR_TIMEOUT_MS = 3 * 60 * 1000; // hard ceiling regardless of page count/complexity

function withTimeout(promise, ms, message) {
  // NOTE: this bounds how long the HTTP request waits, but doesn't actually
  // cancel the underlying OCR work — tesseract.js recognition isn't easily
  // abortable mid-page. A truly hostile large file could still consume CPU
  // in the background after the request has already failed. Combined with
  // MAX_OCR_PAGES above (which prevents the worst cases) and per-user upload
  // rate limiting (uploadLimiter), this is a reasonable mitigation without
  // rewriting OCR to run in a cancellable worker process — a fuller fix
  // would run OCR in a separate worker/queue that can be killed outright.
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Extracts text from a PDF buffer, page by page (needed for citations —
 * chunker.chunkPages tags each chunk with the page it came from).
 *
 * Tries direct text extraction first (fast, works for any normal PDF) using
 * a custom pagerender callback that captures each page's text individually,
 * since pdf-parse's default output only gives one combined string. If that
 * comes back empty or near-empty — the signature of a scanned/image-only PDF
 * — falls back to OCR, which already works page-by-page.
 *
 * NOTE: the pagerender option relies on pdf-parse's internal pdfjs plumbing;
 * this was written against pdf-parse ^1.1.x and not run/tested in this
 * environment (no network access here) — if you upgrade the dependency and
 * this breaks, that callback signature is the first place to check.
 *
 * @param {string} [reqId] - optional request ID (from the calling route) so
 *   this service's log lines can be correlated with the rest of that
 *   request's logs, same as every route-level log call already includes.
 * @returns {Promise<{ pages: string[], fullText: string, method: "text" | "ocr" }>}
 */
export async function extractTextFromPdf(buffer, reqId) {
  const pageTexts = [];
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const text = textContent.items.map((item) => item.str).join(" ");
      pageTexts.push(text);
      return text;
    },
  });

  const directFullText = pageTexts.join("\n\n").trim();

  if (directFullText.length >= MIN_TEXT_LENGTH) {
    return { pages: pageTexts.map((t) => t.trim()), fullText: directFullText, method: "text" };
  }

  // Likely scanned — fall back to OCR. pdf-parse still reports numpages
  // correctly even for image-only PDFs, since page count comes from the
  // PDF's structure, not its text layer.
  const pageCount = parsed.numpages || 1;
  if (pageCount > MAX_OCR_PAGES) {
    const err = new Error(
      `This PDF appears to be scanned and has ${pageCount} pages — OCR is limited to ${MAX_OCR_PAGES} pages per file to keep processing time reasonable. Please split the file or upload a shorter excerpt.`
    );
    err.code = "NO_EXTRACTABLE_TEXT";
    throw err;
  }

  let ocrPages = [];
  try {
    ocrPages = await withTimeout(
      ocrPdfBuffer(buffer, pageCount),
      OCR_TIMEOUT_MS,
      "OCR took too long and was cancelled"
    );
  } catch (ocrErr) {
    logger.error({ reqId, err: ocrErr }, "OCR fallback failed");
    const err = new Error(
      "This PDF appears to be scanned, and OCR wasn't able to process it in time. Please try a different file, a shorter excerpt, or check that the scan is reasonably clear."
    );
    err.code = "NO_EXTRACTABLE_TEXT";
    throw err;
  }

  const ocrFullText = ocrPages.join("\n\n").trim();
  if (ocrFullText.length < MIN_TEXT_LENGTH) {
    const err = new Error(
      "This PDF appears to be scanned, and OCR couldn't extract meaningful text from it. Please check that the scan is clear and try again."
    );
    err.code = "NO_EXTRACTABLE_TEXT";
    throw err;
  }

  return { pages: ocrPages, fullText: ocrFullText, method: "ocr" };
}
