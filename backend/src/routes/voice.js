import { Router } from "express";
import multer from "multer";
import Groq, { toFile } from "groq-sdk";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import logger from "../utils/logger.js";

// Speech-to-text for voice-based Q&A, via Groq's hosted Whisper endpoint.
// Reusing Groq here (already the LLM provider for chat/summary/etc.) means
// no new API key or account is needed for this feature.
//
// NOTE: `toFile` wraps a raw Buffer into the multipart-file shape the Groq
// SDK expects for audio uploads. This mirrors the OpenAI SDK convention Groq's
// client is modeled on — if you upgrade groq-sdk and this errors, check that
// package's README for whether `toFile` still lives at this import path.

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap — a few minutes of audio
});
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

router.use(requireAuth);
router.use(aiLimiter);

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio was provided." });

  try {
    const file = await toFile(req.file.buffer, req.file.originalname || "recording.webm");
    const transcription = await groq.audio.transcriptions.create({
      file,
      model: "whisper-large-v3",
    });
    res.json({ text: transcription.text?.trim() || "" });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Transcription error");
    res.status(500).json({
      error: "Couldn't transcribe that recording. Please try again, or type your question instead.",
    });
  }
});

export default router;
