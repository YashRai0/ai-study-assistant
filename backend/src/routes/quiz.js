import { Router } from "express";
import { z } from "zod";
import { generateQuiz } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { quizSchema, quizResultSchema } from "../validation/schemas.js";
import { extractAndValidateJson } from "../utils/parseJson.js";
import Pdf from "../models/Pdf.js";
import QuizAttempt from "../models/QuizAttempt.js";
import logger from "../utils/logger.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";
import { trackEvent } from "../services/analyticsService.js";

const attemptSchema = z
  .object({
    score: z.number().int().min(0).optional(),
    total: z.number().int().min(1).optional(),
    answers: z.record(z.any()).optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          answer: z.any(),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      // Either answers are provided, items are provided, or score <= total
      if (data.score !== undefined && data.total !== undefined) {
        return data.score <= data.total;
      }
      return true;
    },
    { message: "Score cannot exceed total." }
  );

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);
router.param("pdfId", validateObjectIdParam);

router.post("/:pdfId", validate(quizSchema), async (req, res) => {
  const { mcq, trueFalse, shortAnswer } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    const raw = await generateQuiz(doc.fullText, { mcq, trueFalse, shortAnswer }, {
      contentHash: doc.contentHash,
      compressedText: doc.compressedText,
    });
    const parsed = extractAndValidateJson(raw, quizResultSchema, { arrayBracket: false });

    if (!parsed.success) {
      logger.error({ reqId: req.id, reason: parsed.reason, sample: raw.slice(0, 500) }, "Quiz JSON validation failed");
      return res.status(502).json({
        error: "The AI returned a quiz in an unexpected format. Please try again.",
      });
    }

    // Persist authoritative quiz on the document for server-authoritative scoring
    doc.activeQuiz = parsed.data;
    await doc.save();

    res.json({ quiz: parsed.data });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Quiz error");
    res.status(500).json({ error: "Couldn't generate a quiz right now. Please try again." });
  }
});

// Records a completed attempt's score for the analytics dashboard.
// Server-authoritative: calculates score directly from authoritative quiz questions
// and student answers whenever available, rejecting forged scores.
router.post("/:pdfId/attempts", validate(attemptSchema), async (req, res) => {
  const { answers, items, score, total } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id }).select("subject filename activeQuiz");
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  let finalScore;
  let finalTotal;

  // Path 1: Authoritative scoring against doc.activeQuiz
  if (doc.activeQuiz && answers && typeof answers === "object") {
    let authScore = 0;
    let authTotal = 0;

    if (Array.isArray(doc.activeQuiz.mcq)) {
      doc.activeQuiz.mcq.forEach((q, i) => {
        authTotal++;
        if (answers[`mcq-${i}`] === q.answer) authScore++;
      });
    }

    if (Array.isArray(doc.activeQuiz.trueFalse)) {
      doc.activeQuiz.trueFalse.forEach((q, i) => {
        authTotal++;
        if (answers[`tf-${i}`] === q.answer) authScore++;
      });
    }

    if (authTotal > 0) {
      finalScore = authScore;
      finalTotal = authTotal;
    }
  }

  // Path 2: Authoritative scoring against submitted items with deduplication
  if (finalScore === undefined && Array.isArray(items) && items.length > 0) {
    const seenIds = new Set();
    let itemScore = 0;
    let itemTotal = 0;
    const ansMap = answers || {};

    for (const item of items) {
      if (!item || !item.id || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      itemTotal++;
      if (ansMap[item.id] === item.answer) {
        itemScore++;
      }
    }

    if (itemTotal > 0) {
      finalScore = itemScore;
      finalTotal = itemTotal;
    }
  }

  // Path 3: Fallback with strict bounds validation
  if (finalScore === undefined) {
    if (doc.activeQuiz) {
      // If an authoritative quiz exists for this document, the client cannot
      // submit an arbitrary unverified score without answers.
      return res.status(400).json({ error: "Student answers are required for quiz scoring." });
    }

    if (typeof score !== "number" || typeof total !== "number") {
      return res.status(400).json({ error: "Invalid attempt: score and total are required." });
    }

    if (score < 0 || total <= 0 || score > total) {
      return res.status(400).json({ error: "Invalid score: must be between 0 and total, with total >= 1." });
    }

    finalScore = score;
    finalTotal = total;
  }

  try {
    await QuizAttempt.create({
      owner: req.user.id,
      pdf: doc._id,
      subject: doc.subject,
      filename: doc.filename,
      score: finalScore,
      total: finalTotal,
    });
    await trackEvent(req.user.id, "quiz_completed", { pdfId: doc._id, score: finalScore, total: finalTotal });
    res.status(201).json({ ok: true, score: finalScore, total: finalTotal });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Failed to record quiz attempt");
    res.status(500).json({ error: "Couldn't save this result right now." });
  }
});

export default router;