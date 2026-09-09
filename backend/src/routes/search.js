import { Router } from "express";
import { embedText } from "../services/embeddings.js";
import { hybridRetrieve } from "../services/hybridRetrieval.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import Chunk from "../models/Chunk.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

const ALL_SCOPE = "All subjects";

// Distinct subjects across the student's own chunks — used to populate the
// subject filter pills on the Search page. Chunk (not Pdf) is the source of
// truth here since subject is denormalized onto it (see Chunk.js's comment).
router.get("/subjects", async (req, res) => {
  try {
    const subjects = await Chunk.distinct("subject", { owner: req.user.id });
    res.json({ subjects: subjects.filter(Boolean).sort() });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Failed to list subjects");
    res.status(500).json({ error: "Failed to list subjects." });
  }
});

// Semantic search across the student's notes: embeds the query, retrieves
// the best-matching chunks via hybridRetrieve, and returns them as plain
// JSON results (filename/subject/page/text/score) for the Search page to
// list and link back into that PDF's chat view — distinct from multi-chat
// (multiChat.js), which answers a question conversationally instead of
// returning a ranked list of source passages.
router.post("/", async (req, res) => {
  const { query, subject } = req.body;
  const effectiveScope = subject || ALL_SCOPE;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Search query is required." });
  }

  try {
    const filter = { owner: req.user.id };
    if (effectiveScope !== ALL_SCOPE) filter.subject = effectiveScope;

    const chunks = await Chunk.find(filter).select("pdf text page subject filename embedding").lean();

    if (chunks.length === 0) {
      return res.json({ results: [] });
    }

    const queryEmbedding = await embedText(query);
    const topChunks = hybridRetrieve(chunks, query, queryEmbedding, 20);

    const results = topChunks.map((c) => ({
      pdfId: c.pdf,
      filename: c.filename,
      subject: c.subject,
      page: c.page,
      text: c.text,
      score: c.score,
    }));

    res.json({ results });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Search error");
    res.status(500).json({ error: "Couldn't run that search right now. Please try again." });
  }
});

export default router;