import { generateSummary, generateFlashcards } from "../src/services/llm.js";
import { extractAndValidateJson } from "../src/utils/parseJson.js";
import { flashcardsResultSchema } from "../src/validation/schemas.js";
import logger from "../src/utils/logger.js";

/**
 * Worker: Synthesis jobs (summaries, flashcards, study guides)
 *
 * Input: { type: 'summary' | 'flashcard' | 'studyGuide', text, style?, count? }
 * Output: varies by type
 *   - summary: { summary, wordCount }
 *   - flashcard: { cards: [{ front, back }, ...] }
 *   - studyGuide: { sections: [...] }
 *
 * NOTE: this queue is currently never enqueued anywhere in the app —
 * routes/summary.js and routes/flashcards.js call generateSummary() /
 * generateFlashcards() directly and synchronously instead. This worker
 * exists for a future move to async synthesis but isn't on the live path
 * today. It was previously broken regardless: it imported three function
 * names (answerWithLLM, summarizeWithLLM, generateFlashcardsWithLLM) that
 * don't exist in llm.js, and — since workers/index.js imports every
 * processor file eagerly at startup — that alone would have crashed the
 * entire worker process before any queue (including the ones that ARE
 * live, like uploadPdf and embedChunks) could start.
 */
export async function processSynthesis(job) {
  const { type, text, style, count } = job.data;
  logger.info({ jobId: job.id, type, textLength: text.length }, "Starting synthesis job");

  try {
    if (!text || text.trim().length === 0) {
      throw new Error("No text provided for synthesis");
    }

    let result;

    switch (type) {
      case "summary": {
        const summary = await generateSummary(text, style || "bullets");
        result = {
          summary,
          wordCount: summary.split(/\s+/).length,
        };
        break;
      }

      case "flashcard": {
        // generateFlashcards returns raw LLM text, not parsed objects —
        // same parsing step routes/flashcards.js uses on the live path.
        const raw = await generateFlashcards(text, count || 10);
        const parsed = extractAndValidateJson(raw, flashcardsResultSchema, { arrayBracket: true });
        if (!parsed.success) {
          throw new Error(`Failed to generate flashcards: ${parsed.reason}`);
        }
        result = { cards: parsed.data };
        break;
      }

      case "studyGuide": {
        const summary = await generateSummary(text, "medium");
        const raw = await generateFlashcards(text, 15);
        const parsed = extractAndValidateJson(raw, flashcardsResultSchema, { arrayBracket: true });
        if (!parsed.success) {
          throw new Error(`Failed to generate flashcards: ${parsed.reason}`);
        }
        result = {
          summary,
          keyPoints: parsed.data.slice(0, 5).map((c) => c.front),
          flashcards: parsed.data,
        };
        break;
      }

      default:
        throw new Error(`Unknown synthesis type: ${type}`);
    }

    logger.info({ jobId: job.id, type }, "Synthesis job completed");
    return result;
  } catch (err) {
    logger.error({ jobId: job.id, type, err }, "Synthesis job failed");
    throw err;
  }
}
