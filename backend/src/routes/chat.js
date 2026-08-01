import { Router } from "express";
import { embedText } from "../services/embeddings.js";
import { retrieveTopK, bestScore, SIMILARITY_THRESHOLD } from "../services/vectorStore.js";
import { streamAnswerFromNotes, streamExplainSimply } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { chatMessageSchema } from "../validation/schemas.js";
import Pdf from "../models/Pdf.js";
import Chunk from "../models/Chunk.js";
import ChatMessage from "../models/ChatMessage.js";
import logger from "../utils/logger.js";
import { validateObjectIdParam } from "../middleware/validateObjectId.js";

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);
router.param("pdfId", validateObjectIdParam);

router.get("/recent", async (req, res) => {
  const messages = await ChatMessage.find({ owner: req.user.id, role: "user" })
    .sort({ ts: -1 })
    .limit(5)
    .populate("pdf", "filename")
    .lean();

  res.json({
    recent: messages
      .filter((m) => m.pdf)
      .map((m) => ({
        pdfId: m.pdf._id,
        filename: m.pdf.filename,
        content: m.content,
        ts: m.ts,
      })),
  });
});

router.post("/:pdfId", validate(chatMessageSchema), async (req, res) => {
  const { pdfId } = req.params;
  const { message, mode } = req.body;

  const doc = await Pdf.findOne({ _id: pdfId, owner: req.user.id }).select("_id");
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  try {
    const chunks = await Chunk.find({ pdf: pdfId, owner: req.user.id }).select("text page embedding").lean();
    const queryEmbedding = await embedText(message);
    const topChunks = retrieveTopK(chunks, queryEmbedding, 4);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    const sendToken = (token) => res.write(`data: ${JSON.stringify({ token })}

`);

    let fullAnswer;
    if (mode !== "explain" && bestScore(topChunks) < SIMILARITY_THRESHOLD) {
      fullAnswer = "I couldn'''t find this information in your uploaded notes.";
      sendToken(fullAnswer);
    } else if (mode === "explain") {
      fullAnswer = await streamExplainSimply(message, topChunks, sendToken, controller.signal);
    } else {
      fullAnswer = await streamAnswerFromNotes(message, topChunks, sendToken, controller.signal);
    }

    if (!controller.signal.aborted) {
      res.write(`data: ${JSON.stringify({ done: true })}

`);
      res.end();
    }

    await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "user", content: message });
    await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "assistant", content: fullAnswer });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn'''t generate an answer right now. Please try again." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong while generating the answer." })}

`);
      res.end();
    }
  }
});

router.get("/:pdfId/history", async (req, res) => {
  const doc = await Pdf.findOne({ _id: req.params.pdfId, owner: req.user.id }).select("_id");
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  const history = await ChatMessage.find({ pdf: req.params.pdfId, owner: req.user.id })
    .sort({ ts: 1 })
    .limit(500);
  res.json({ history });
});

router.delete("/:pdfId/history", async (req, res) => {
  await ChatMessage.deleteMany({ pdf: req.params.pdfId, owner: req.user.id });
  res.json({ ok: true });
});

export default router;