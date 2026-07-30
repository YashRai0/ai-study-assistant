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

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

// Streams the answer as Server-Sent Events instead of waiting for the full
// response: each event is `data: {"token": "..."}\n\n`, ending with
// `data: {"done": true}\n\n`. The frontend reads this via fetch + a
// ReadableStream reader (not the native EventSource API, which only
// supports GET — this is a POST with a JSON body).
router.post("/:pdfId", validate(chatMessageSchema), async (req, res) => {
  const { pdfId } = req.params;
  const { message, mode } = req.body; // mode: "chat" | "explain"

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

    // Without this, closing the tab or navigating away mid-answer left the
    // Groq stream running to completion on the server regardless — burning
    // API quota and cost for a response nobody would ever read. `close`
    // fires on both a clean end and an abrupt disconnect, so this covers
    // either case.
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const sendToken = (token) => res.write(`data: ${JSON.stringify({ token })}\n\n`);

    // If even the best match is a weak one, don't hand the LLM a strained
    // context to answer from — say plainly that nothing relevant was found,
    // without spending a Groq call on it.
    let fullAnswer;
    if (mode !== "explain" && bestScore(topChunks) < SIMILARITY_THRESHOLD) {
      fullAnswer = "I couldn't find this information in your uploaded notes.";
      sendToken(fullAnswer);
    } else if (mode === "explain") {
      fullAnswer = await streamExplainSimply(message, topChunks, sendToken, controller.signal);
    } else {
      fullAnswer = await streamAnswerFromNotes(message, topChunks, sendToken, controller.signal);
    }

    // If the client disconnected mid-stream, there's no one to send the
    // closing SSE event to, and the answer is incomplete — skip both the
    // final write and saving a half-formed response to history.
    if (controller.signal.aborted) return;

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "user", content: message });
    await ChatMessage.create({ pdf: pdfId, owner: req.user.id, role: "assistant", content: fullAnswer });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't generate an answer right now. Please try again." });
    } else {
      // Streaming had already started — can't change the status code at this
      // point, so send an error event the frontend knows to look for instead.
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