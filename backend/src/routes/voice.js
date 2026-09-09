import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { transcribeAudio } from "../services/llm.js";
import logger from "../utils/logger.js";

// Speech-to-text for voice-based Q&A, via Groq's hosted Whisper endpoint
// (shared with processAudioUpload.js's longer-recording ingestion — see
// transcribeAudio's docstring in llm.js for why this is a shared function
// rather than each caller building its own Groq client).

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap — a few minutes of audio
});

router.use(requireAuth);
router.use(aiLimiter);

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No audio was provided." });

  try {
    const text = await transcribeAudio(req.file.buffer, req.file.originalname || "recording.webm");
    res.json({ text });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Transcription error");
    res.status(500).json({
      error: "Couldn't transcribe that recording. Please try again, or type your question instead.",
    });
  }
});

export default router;
