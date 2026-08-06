import { answerWithLLM, generateFlashcardsWithLLM, summarizeWithLLM } from "../src/services/llm.js";
import { logger } from "../src/services/logger.js";

/**
 * Worker: Synthesis jobs (summaries, flashcards, study guides)
 *
 * Input: { type: 'summary' | 'flashcard' | 'studyGuide', text, maxLength?, count? }
 * Output: varies by type
 *   - summary: { summary, wordCount }
 *   - flashcard: { cards: [{ question, answer }, ...] }
 *   - studyGuide: { sections: [...] }
 *
 * Long-running LLM calls are offloaded here. The route enqueues and either:
 * a) waits for completion (if quick <5s), or
 * b) returns jobId immediately and user polls for status
 */
export async function processSynthesis(job) {
  const { type, text, maxLength, count } = job.data;
  logger.info({ jobId: job.id, type, textLength: text.length }, "Starting synthesis job");

  try {
    if (!text || text.trim().length === 0) {
      throw new Error("No text provided for synthesis");
    }

    let result;

    switch (type) {
      case "summary": {
        const summary = await summarizeWithLLM(text, { maxLength: maxLength || 500 });
        result = {
          summary,
          wordCount: summary.split(/\s+/).length,
        };
        break;
      }

      case "flashcard": {
        const cards = await generateFlashcardsWithLLM(text, { count: count || 10 });
        if (!Array.isArray(cards) || cards.length === 0) {
          throw new Error("Failed to generate flashcards");
        }
        result = { cards };
        break;
      }

      case "studyGuide": {
        const summary = await summarizeWithLLM(text, { maxLength: 1000 });
        const cards = await generateFlashcardsWithLLM(text, { count: 15 });
        result = {
          summary,
          keyPoints: cards.slice(0, 5).map((c) => c.question),
          flashcards: cards,
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
