import { Router } from "express";
import { embedText } from "../services/embeddings.js";
import { retrieveTopK, bestScore, SIMILARITY_THRESHOLD } from "../services/vectorStore.js";
import { streamAnswerAcrossNotes } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { multiChatMessageSchema } from "../validation/schemas.js";
import Chunk from "../models/Chunk.js";
import MultiChatMessage from "../models/MultiChatMessage.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);
router.use(aiLimiter);

const ALL_SCOPE = "All subjects";

// Same SSE streaming pattern as chat.js — see the comment there for the
// wire format and why this uses fetch+ReadableStream on the frontend
// instead of the native EventSource API.
router.post("/", validate(multiChatMessageSchema), async (req, res) => {
  const { message, scope } = req.body;
  const effectiveScope = scope || ALL_SCOPE;

  try {
    const filter = { owner: req.user.id };
    if (effectiveScope !== ALL_SCOPE) filter.subject = effectiveScope;

    // Querying the Chunk collection directly (rather than loading every
    // matching Pdf document and its embedded chunks) means this only reads
    // the chunk data it actually needs, filtered at the database level.
    const chunkCount = await Chunk.countDocuments(filter);

    // Headers are set only once we're past the checks that could still fail
    // cleanly with a JSON error — same reasoning as chat.js, so an early
    // DB failure returns a normal error response instead of a mid-stream one.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Same reasoning as chat.js: without this, an abandoned request kept the
    // Groq stream running server-side to completion for nothing.
    const controller = new AbortController();
    req.on("close", () => controller.abort());

    const sendToken = (token) => res.write(`data: ${JSON.stringify({ token })}\n\n`);

    let fullAnswer;

    if (chunkCount === 0) {
      fullAnswer =
        effectiveScope === ALL_SCOPE
          ? "You haven't uploaded any notes yet — upload a PDF first."
          : `You haven't uploaded any notes under "${effectiveScope}" yet.`;
      sendToken(fullAnswer);
    } else {
      const chunks = await Chunk.find(filter).select("text page filename subject embedding").lean();
      const queryEmbedding = await embedText(message);
      // Wider net than single-PDF chat (6 vs 4) since relevant material may be
      // spread thinner across more documents.
      const topChunks = retrieveTopK(chunks, queryEmbedding, 6);

      if (bestScore(topChunks) < SIMILARITY_THRESHOLD) {
        fullAnswer = "I couldn't find this information in your uploaded notes.";
        sendToken(fullAnswer);
      } else {
        fullAnswer = await streamAnswerAcrossNotes(message, topChunks, sendToken, controller.signal);
      }
    }

    if (controller.signal.aborted) return;

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    await MultiChatMessage.create({ owner: req.user.id, scope: effectiveScope, role: "user", content: message });
    await MultiChatMessage.create({ owner: req.user.id, scope: effectiveScope, role: "assistant", content: fullAnswer });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Multi-chat error");
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't generate an answer right now. Please try again." });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong while generating the answer." })}\n\n`);
      res.end();
    }
  }
});

router.get("/history", async (req, res) => {
  const scope = req.query.scope || ALL_SCOPE;
  const history = await MultiChatMessage.find({ owner: req.user.id, scope }).sort({ ts: 1 }).limit(500);
  res.json({ history });
});

router.delete("/history", async (req, res) => {
  const scope = req.query.scope || ALL_SCOPE;
  await MultiChatMessage.deleteMany({ owner: req.user.id, scope });
  res.json({ ok: true });
});

export default router;