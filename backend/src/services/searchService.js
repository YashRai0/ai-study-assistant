import Concept from "../models/Concept.js";
import Chunk from "../models/Chunk.js";
import Course from "../models/Course.js";
import PDF from "../models/Pdf.js";

// Escapes regex metacharacters so a search query is matched as literal
// text. Without this, a query is passed straight into `new RegExp(...)` —
// special characters like `.`, `*`, `(` change what gets matched instead
// of being searched for literally, and a crafted pattern (e.g. nested
// quantifiers) can cause catastrophic backtracking (ReDoS) against
// MongoDB's regex engine.
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function searchPattern(query) {
  return new RegExp(escapeRegex(query), "i");
}

// Full-text search on concepts
export async function searchConcepts(query, courseId, limit = 20) {
  if (!query || query.length < 2) return [];

  const searchRegex = searchPattern(query);

  const concepts = await Concept.find({
    course: courseId,
    $or: [
      { name: searchRegex },
      { description: searchRegex },
    ],
  })
    .limit(limit)
    .lean();

  return concepts;
}

// Full-text search on PDF chunks (by content)
export async function searchChunks(query, pdfId, limit = 20) {
  if (!query || query.length < 2) return [];

  const searchRegex = searchPattern(query);

  const chunks = await Chunk.find({
    pdf: pdfId,
    text: searchRegex,
  })
    .limit(limit)
    .lean();

  return chunks;
}

// Global search across all content
export async function globalSearch(userId, query, limit = 50) {
  if (!query || query.length < 2) return { concepts: [], chunks: [] };

  const searchRegex = searchPattern(query);

  // Get user's courses
  const courses = await Course.find({ owner: userId }).select("_id").lean();
  const courseIds = courses.map((c) => c._id);

  // Search concepts in user's courses
  const concepts = await Concept.find({
    course: { $in: courseIds },
    $or: [
      { name: searchRegex },
      { description: searchRegex },
    ],
  })
    .limit(limit / 2)
    .lean();

  // Search chunks in user's PDFs
  const pdfs = await PDF.find({ owner: userId }).select("_id").lean();
  const pdfIds = pdfs.map((p) => p._id);

  const chunks = await Chunk.find({
    pdf: { $in: pdfIds },
    text: searchRegex,
  })
    .limit(limit / 2)
    .lean();

  return { concepts, chunks };
}
