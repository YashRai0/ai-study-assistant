import { transcribeAudio } from "./llm.js";
import logger from "../utils/logger.js";

/**
 * Transcribes a longer audio recording (e.g. a lecture) into normalized
 * text, matching extractTextFromPdf/Docx/Pptx's { pages, fullText, method }
 * shape.
 *
 * Whisper doesn't return per-segment timestamps through this endpoint (only
 * plain text — see transcribeAudio in llm.js), so there's no natural page
 * boundary to group by the way youtubeParser.js can group transcript
 * segments; this is returned as a single page. A future improvement noted
 * for later, not attempted here: Groq's Whisper endpoint also supports a
 * verbose_json response format with segment timestamps, which would let
 * this page-group the same way YouTube's transcript does — not done now to
 * keep this change scoped to what's actually needed.
 *
 * Verification limitation: like youtubeParser.js, the actual Whisper API
 * call itself can't be exercised from this environment (no network access
 * to Groq's API from this sandbox either) — what IS tested is this
 * function's own normalization/error-handling logic, via an injectable
 * transcribeFn (see test/audioParser.test.js).
 */
export async function extractTextFromAudio(buffer, filename, { transcribeFn = transcribeAudio } = {}) {
  const text = (await transcribeFn(buffer, filename)).trim();

  if (!text) {
    throw new Error("No speech was detected in this audio file.");
  }

  logger.info({ filename, textLength: text.length }, "Audio transcription complete");

  return { pages: [text], fullText: text, method: "audio" };
}
