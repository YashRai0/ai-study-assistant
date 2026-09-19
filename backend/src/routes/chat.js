import { Router } from "express";
import { embedText } from "../services/embeddings.js";
import { bestScore, SIMILARITY_THRESHOLD } from "../services/vectorStore.js";
import { hybridRetrieve } from "../services/hybridRetrieval.js";
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

  const doc = await Pdf.findOne({ _id: pdfId, owner: req.user.id }).select(
    "_id filename processingStatus processingError"
  );
  if (!doc) return res.status(404).json({ error: "PDF not found." });

  // BullMQ: PDF must be fully processed before chat is allowed
  if (doc.processingStatus !== "ready") {
    return res.status(409).json({
      error: `PDF is still processing (${doc.processingStatus}). Please wait a moment and try again.`,
      processingStatus: doc.processingStatus,
      processingError: doc.processingError,
    });
  }

  try {
    const chunks = await Chunk.find({ pdf: pdfId, owner: req.user.id }).select("text page embedding").lean();
    const queryEmbedding = await embedText(message);
    const topChunks = hybridRetrieve(chunks, message, queryEmbedding, 4);

    const topScore = bestScore(topChunks);
    const confidence =
      topScore >= 0.65 ? "HIGH" : topScore >= SIMILARITY_THRESHOLD ? "MEDIUM" : "LOW";

    const sources =
      confidence !== "LOW"
        ? topChunks
            .filter((c) => c.page !== undefined && c.page !== null)
            .map((c) => ({
              filename: doc.filename || "Uploaded Document",
              page: c.page,
              score: Math.round((c.score || 0) * 100),
              excerpt: (c.text || "").slice(0, 160).trim() + "...",
            }))
            .filter((c, idx, arr) => arr.findIndex((x) => x.page === c.page) === idx)
            .slice(0, 3)
        : [];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const controller = new AbortController();
    req.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });

    let accumulated = "";
    const sendToken = (token) => {
      accumulated += token;
      if (!res.writableEnded && !controller.signal.aborted) {
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    };

    // Emit initial metadata event with confidence and sources
    res.write(`data: ${JSON.stringify({ meta: { confidence, sources } })}\n\n`);

    let fullAnswer = "";
    let isAborted = false;
    try {
      if (mode !== "explain" && confidence === "LOW") {
        fullAnswer = "I couldn't find this information in your uploaded notes.";
        sendToken(fullAnswer);
      } else if (mode === "explain") {
        const streamResult = await streamExplainSimply(message, topChunks, sendToken, controller.signal);
        fullAnswer = streamResult || accumulated;
      } else {
        const streamResult = await streamAnswerFromNotes(message, topChunks, sendToken, controller.signal);
        fullAnswer = streamResult || accumulated;
      }
    } catch (streamErr) {
      if (controller.signal.aborted || streamErr?.name === "AbortError") {
        isAborted = true;
        fullAnswer = accumulated;
      } else {
        throw streamErr;
      }
    }

    if (controller.signal.aborted || isAborted) {
      const partialTrimmed = (fullAnswer || accumulated || "").trim();
      await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "user", content: message });
      if (partialTrimmed.length > 0) {
        await ChatMessage.create({
          pdf: pdfId,
          owner: req.user.id,
          role: "assistant",
          content: partialTrimmed,
          sources,
          confidence,
          status: "interrupted",
        });
      }
      return;
    }

    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true, confidence, sources })}\n\n`);
      res.end();
    }

    await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "user", content: message });
    await ChatMessage.create({
      pdf: pdfId,
      owner: req.user.id,
      role: "assistant",
      content: fullAnswer,
      sources,
      confidence,
      status: "complete",
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't generate an answer right now. Please try again." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong while generating the answer." })}\n\n`);
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