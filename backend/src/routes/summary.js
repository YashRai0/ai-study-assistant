import { Router } from "express";
import { generateSummary } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { summarySchema } from "../validation/schemas.js";
import Pdf from "../models/Pdf.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

router.post("/:pdfId", validate(summarySchema), async (req, res) => {
  const { style } = req.body;
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id });
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    const summary = await generateSummary(doc.fullText, style);
    res.json({ summary });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Summary error");
    res.status(500).json({ error: "Couldn't generate a summary right now. Please try again." });
  }
});

export default router;
