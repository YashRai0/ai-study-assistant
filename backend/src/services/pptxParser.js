import JSZip from "jszip";
import logger from "../utils/logger.js";

// Slide text in OOXML lives inside <a:t>...</a:t> runs within each
// ppt/slides/slideN.xml. This is a deliberately narrow, direct
// ZIP+regex extraction rather than a full XML parse — PPTX's DrawingML
// text structure is well-documented and stable, and avoids pulling in a
// heavier office-document library (officeparser bundles pdfjs-dist,
// which has a known "arbitrary JS execution on malicious PDF"
// vulnerability — unwanted attack surface for a feature that only needs
// to read text runs out of a slide).
const TEXT_RUN_PATTERN = /<a:t>([\s\S]*?)<\/a:t>/g;

function decodeXmlEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // must be last, or it would double-decode the others
}

function extractSlideText(slideXml) {
  const runs = [];
  let match;
  while ((match = TEXT_RUN_PATTERN.exec(slideXml)) !== null) {
    runs.push(decodeXmlEntities(match[1]));
  }
  return runs.join(" ").trim();
}

/**
 * Extracts plain text from a .pptx file buffer, one "page" per slide —
 * matching extractTextFromPdf/extractTextFromDocx's { pages, fullText,
 * method } shape so processPptxUpload.js can reuse the same downstream
 * pipeline (Pdf.fullText, chunking, embedding) with no format-specific
 * branching past this extraction step.
 */
export async function extractTextFromPptx(buffer, jobId) {
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    // Numeric sort, not alphabetical — "slide10.xml" would otherwise sort
    // before "slide2.xml" as a string, scrambling slide order for any
    // presentation with 10+ slides.
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)[1]);
      const numB = Number(b.match(/slide(\d+)\.xml$/)[1]);
      return numA - numB;
    });

  if (!slideFiles.length) {
    throw new Error("No slides found in this PPTX file — it may be corrupted or empty.");
  }

  const pages = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.files[slideFile].async("string");
    pages.push(extractSlideText(xml));
  }

  const nonEmptyPages = pages.filter(Boolean);
  if (!nonEmptyPages.length) {
    throw new Error("No readable text found in this PPTX file — it may contain only images or empty slides.");
  }

  logger.info({ jobId, slideCount: slideFiles.length, textSlides: nonEmptyPages.length }, "PPTX extraction complete");

  // Uses "--- Page N ---" (not "--- Slide N ---") to match
  // processEmbedChunks.js's page-splitting regex exactly — a slide is a
  // reasonable semantic fit for "page" downstream (Chunk.page, per-page
  // source attribution), and reusing the existing, already-tested
  // splitting logic avoids needing a parallel "slide" code path there.
  const fullText = pages
    .map((text, i) => `--- Page ${i + 1} ---\n${text}`)
    .join("\n");

  return { pages, fullText, method: "pptx" };
}
