// OCR fallback for scanned/image-only PDFs.
//
// Pipeline: rasterize each PDF page to an image (pdf2pic) -> run OCR on each
// image (tesseract.js, pure JS/WASM, no API key needed) -> join the text.
//
// SYSTEM DEPENDENCY: pdf2pic rasterizes pages using Ghostscript + GraphicsMagick
// under the hood — these must be installed on whatever machine runs the backend.
//   macOS:   brew install ghostscript graphicsmagick
//   Ubuntu:  sudo apt-get install -y ghostscript graphicsmagick
//   Railway: see backend/nixpacks.toml in this project — it installs both automatically.
// Without these installed, OCR will throw; text-based PDFs are unaffected since
// they never reach this code path.
//
// NOTE: pdf2pic's exact API has shifted across versions. This was written against
// pdf2pic ^3.x — if you upgrade the dependency, double-check fromBuffer()'s option
// names against that version's README before relying on this in production.

import { fromBuffer } from "pdf2pic";
import { createWorker } from "tesseract.js";

/**
 * Runs OCR across every page of a PDF and returns the text of each page
 * separately (so callers can tag chunks with a page number for citations).
 * @param {Buffer} pdfBuffer
 * @param {number} numPages - page count (get this from pdf-parse's metadata first)
 * @returns {Promise<string[]>} one string per page, in order
 */
export async function ocrPdfBuffer(pdfBuffer, numPages) {
  const convert = fromBuffer(pdfBuffer, {
    density: 150,
    format: "png",
    width: 1200,
    height: 1600,
  });

  const worker = await createWorker("eng");
  const pageTexts = [];

  try {
    for (let page = 1; page <= numPages; page++) {
      const { buffer: imageBuffer } = await convert(page, { responseType: "buffer" });
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      pageTexts.push(text.trim());
    }
  } finally {
    await worker.terminate();
  }

  return pageTexts;
}
