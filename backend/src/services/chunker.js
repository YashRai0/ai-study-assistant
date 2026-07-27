// Splits text into overlapping chunks for embedding + retrieval.
// v1 default: ~500 "tokens" (approximated as words) per chunk, 50 word overlap,
// preferring paragraph boundaries where possible.

const CHUNK_SIZE = 500; // words
const CHUNK_OVERLAP = 50; // words

export function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  // Flatten paragraphs into a single word stream while remembering
  // paragraph boundaries, so we can prefer splitting there.
  const words = paragraphs.join(" \n\n ").split(/\s+/);

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);
    const chunkStr = chunkWords.join(" ").replace(/\s*\n\n\s*/g, "\n\n").trim();
    if (chunkStr) chunks.push(chunkStr);

    if (end === words.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Chunks a PDF's text page-by-page instead of as one continuous stream, and
 * tags each resulting chunk with the page number it came from. This is what
 * lets chat/search answers cite "(Page 12)" — the tradeoff is that a chunk
 * never spans a page boundary, even if the underlying content logically
 * continues across pages.
 * @param {string[]} pages - one string per PDF page, in order
 * @returns {Array<{ text: string, page: number }>}
 */
export function chunkPages(pages, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  pages.forEach((pageText, idx) => {
    const pageNumber = idx + 1;
    if (!pageText || !pageText.trim()) return;
    chunkText(pageText, chunkSize, overlap).forEach((text) => {
      chunks.push({ text, page: pageNumber });
    });
  });
  return chunks;
}
