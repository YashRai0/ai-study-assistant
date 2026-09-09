import mammoth from "mammoth";
import logger from "../utils/logger.js";

/**
 * Extracts plain text from a .docx file buffer. Unlike PDFs, DOCX doesn't
 * have a natural per-page boundary (pagination is a rendering concern, not
 * part of the file format itself), so this returns the whole document as
 * one "page" — the downstream worker already handles a single-page result
 * correctly (see processPdfUpload.js: `pageTexts.length > 1 ? ... : rawText`).
 *
 * Returns the same shape as extractTextFromPdf({ pages, fullText, method })
 * so processDocxUpload.js can reuse the exact same downstream logic
 * (Pdf.fullText, chunking, embedding) without needing format-specific
 * branching anywhere past this extraction step.
 */
export async function extractTextFromDocx(buffer, jobId) {
  const result = await mammoth.extractRawText({ buffer });

  if (result.messages?.length) {
    // mammoth reports non-fatal issues (unsupported formatting, etc.) as
    // messages rather than throwing — worth logging so a garbled-looking
    // extraction has a paper trail, but not worth failing the upload over.
    logger.info({ jobId, messages: result.messages.slice(0, 5) }, "DOCX extraction messages");
  }

  const fullText = (result.value || "").trim();
  if (!fullText) {
    throw new Error("No readable text found in this DOCX file — it may be empty, corrupted, or contain only images.");
  }

  return { pages: [fullText], fullText, method: "docx" };
}
