import { Router } from "express";
import { generateFlashcards } from "../services/llm.js";
import { scheduleNextReview } from "../services/spacedRepetition.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { flashcardsSchema, flashcardsResultSchema, reviewFlashcardSchema } from "../validation/schemas.js";
import { extractAndValidateJson } from "../utils/parseJson.js";
import Pdf from "../models/Pdf.js";
import Flashcard from "../models/Flashcard.js";
import logger from "../utils/logger.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";

const router = Router();
router.use(requireAuth);
router.param("pdfId", validateObjectIdParam);
router.param("cardId", validateObjectIdParam);

// Generates flashcards for a PDF and PERSISTS them (previously these were
// only ever held in React state and thrown away on refresh) — spaced
// repetition needs cards that stick around with per-card review history,
// not a fresh throwaway set each time.
router.post("/:pdfId", aiLimiter, validate(flashcardsSchema), async (req, res) => {
  const { count } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    const raw = await generateFlashcards(doc.fullText, count || 15);
    const parsed = extractAndValidateJson(raw, flashcardsResultSchema, { arrayBracket: true });

    if (!parsed.success) {
      logger.error({ reqId: req.id, reason: parsed.reason, sample: raw.slice(0, 500) }, "Flashcard JSON validation failed");
      return res.status(502).json({
        error: "The AI returned flashcards in an unexpected format. Please try again.",
      });
    }

    const created = await Flashcard.insertMany(
      parsed.data.map((c) => ({
        owner: req.user.id,
        pdf: doc._id,
        subject: doc.subject,
        filename: doc.filename,
        front: c.front,
        back: c.back,
        // easeFactor/interval/repetitions/nextReviewDate all take their
        // schema defaults — a fresh card starts due immediately.
      }))
    );

    res.json({ flashcards: created });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Flashcard error");
    res.status(500).json({ error: "Couldn't generate flashcards right now. Please try again." });
  }
});

// Saved flashcards for one PDF (regardless of review-due status) — used by
// the per-PDF flip-through view.
router.get("/:pdfId", async (req, res) => {
  const cards = await Flashcard.find({ pdf: req.params.pdfId, owner: req.user.id }).sort({ createdAt: 1 });
  res.json({ flashcards: cards });
});

// Cards due for review right now, optionally scoped to a subject — powers
// the spaced-repetition review queue across all of a user's PDFs at once.
router.get("/due/queue", async (req, res) => {
  const { subject } = req.query;
  const filter = { owner: req.user.id, nextReviewDate: { $lte: new Date() } };
  if (subject && subject !== "All subjects") filter.subject = subject;

  const cards = await Flashcard.find(filter).sort({ nextReviewDate: 1 }).limit(200);
  res.json({ cards });
});

router.post("/:cardId/review", validate(reviewFlashcardSchema), async (req, res) => {
  const { quality } = req.body;

  const card = await Flashcard.findOne({ _id: req.params.cardId, owner: req.user.id });
  if (!card) return res.status(404).json({ error: "Flashcard not found." });

  const { easeFactor, interval, repetitions, nextReviewDate } = scheduleNextReview(
    { easeFactor: card.easeFactor, interval: card.interval, repetitions: card.repetitions },
    quality
  );

  card.easeFactor = easeFactor;
  card.interval = interval;
  card.repetitions = repetitions;
  card.nextReviewDate = nextReviewDate;
  await card.save();

  res.json({ nextReviewDate, interval });
});

router.delete("/:cardId", async (req, res) => {
  const result = await Flashcard.deleteOne({ _id: req.params.cardId, owner: req.user.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Flashcard not found." });
  res.json({ ok: true });
});

export default router;