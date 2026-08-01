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

const attemptSchema = z.object({
  score: z.number().int().min(0),
  total: z.number().int().min(0),
});

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);
router.param("pdfId", validateObjectIdParam);

router.post("/:pdfId", validate(quizSchema), async (req, res) => {
  const { mcq, trueFalse, shortAnswer } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    const raw = await generateQuiz(doc.fullText, { mcq, trueFalse, shortAnswer });
    const parsed = extractAndValidateJson(raw, quizResultSchema, { arrayBracket: false });

    if (!parsed.success) {
      logger.error({ reqId: req.id, reason: parsed.reason, sample: raw.slice(0, 500) }, "Quiz JSON validation failed");
      return res.status(502).json({
        error: "The AI returned a quiz in an unexpected format. Please try again.",
      });
    }

    res.json({ quiz: parsed.data });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Quiz error");
    res.status(500).json({ error: "Couldn't generate a quiz right now. Please try again." });
  }
});

// Records a completed attempt's score for the analytics dashboard. The quiz
// itself is graded client-side (Quiz.jsx already has the answer key); this
// just persists the result once the student checks their answers.
router.post("/:pdfId/attempts", validate(attemptSchema), async (req, res) => {
  const { score, total } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id }).select("subject filename");
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    await QuizAttempt.create({
      owner: req.user.id,
      pdf: doc._id,
      subject: doc.subject,
      filename: doc.filename,
      score,
      total,
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Failed to record quiz attempt");
    res.status(500).json({ error: "Couldn't save this result right now." });
  }
});

export default router;