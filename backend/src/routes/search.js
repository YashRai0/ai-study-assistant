import { Router } from "express";
import { embedText } from "../services/embeddings.js";
import { retrieveTopK } from "../services/vectorStore.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { searchSchema } from "../validation/schemas.js";
import Pdf from "../models/Pdf.js";
import Chunk from "../models/Chunk.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

// Distinct subjects the user has uploaded under — powers the filter dropdown.
// Queried from Pdf (one row per file) rather than Chunk (one row per chunk)
// since it's the same answer for far less data scanned.
router.get("/subjects", async (req, res) => {
  const subjects = await Pdf.distinct("subject", { owner: req.user.id });
  res.json({ subjects: subjects.sort() });
});

// Semantic search: ranks chunks across ALL of the user's PDFs (optionally
// scoped to one subject) by meaning, not keyword match — e.g. a query like
// "why processes wait on each other" can surface a chunk about deadlocks
// even if it never uses the word "wait". Unlike chat, search intentionally
// shows whatever it finds regardless of match strength (with a score badge)
// rather than applying a similarity threshold — a search page hiding "weak"
// results outright would be more surprising than helpful.
router.post("/", validate(searchSchema), async (req, res) => {
  const { query, subject, limit } = req.body;

  try {
    const filter = { owner: req.user.id };
    if (subject && subject !== "All subjects") filter.subject = subject;

    const chunks = await Chunk.find(filter).select("pdf text page filename subject embedding").lean();
    if (chunks.length === 0) {
      return res.json({ results: [] });
    }

    const queryEmbedding = await embedText(query);
    const results = retrieveTopK(chunks, queryEmbedding, limit || 8).map((r) => ({
      ...r,
      pdfId: r.pdf,
    }));

    res.json({ results });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Search error");
    res.status(500).json({ error: "Couldn't run that search right now. Please try again." });
  }
});

export default router;