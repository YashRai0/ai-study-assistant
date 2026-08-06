import { chunk as chunkText } from "../src/services/chunker.js";
import { generateEmbeddings } from "../src/services/embeddings.js";
import { Chunk } from "../src/models/Chunk.js";
import { logger } from "../src/services/logger.js";

/**
 * Worker: Embed chunks from PDF text
 *
 * Input: { pdfId, text, pageCount }
 * Output: { chunksCreated, embeddingsGenerated, avgChunkLength }
 *
 * Splits text into semantic chunks (500 tokens with 100-token overlap),
 * generates embeddings for each, saves to MongoDB.
 */
export async function processEmbedChunks(job) {
  const { pdfId, text, pageCount } = job.data;
  logger.info({ jobId: job.id, pdfId }, "Processing embeddings for chunks");

  try {
    if (!pdfId || !text) {
      throw new Error("Missing pdfId or text");
    }

    // Split into chunks
    const chunks = await chunkText(text, {
      chunkSize: 500,
      chunkOverlap: 100,
    });

    logger.info({ jobId: job.id, pdfId, chunkCount: chunks.length }, "Text chunked");

    if (chunks.length === 0) {
      throw new Error("No chunks generated from PDF text");
    }

    // Generate embeddings for all chunks (batch)
    const embeddings = await generateEmbeddings(chunks);

    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding count mismatch");
    }

    // Save chunks + embeddings to MongoDB
    const chunkDocs = chunks.map((chunkText, idx) => ({
      pdfId,
      text: chunkText,
      embedding: embeddings[idx],
      pageNumber: Math.floor((idx / chunks.length) * pageCount) + 1, // rough estimate
      createdAt: new Date(),
    }));

    await Chunk.insertMany(chunkDocs);

    logger.info(
      { jobId: job.id, pdfId, chunksCreated: chunkDocs.length, avgLength: Math.round(text.length / chunks.length) },
      "Chunks saved to database"
    );

    return {
      chunksCreated: chunkDocs.length,
      embeddingsGenerated: embeddings.length,
      avgChunkLength: Math.round(text.length / chunks.length),
    };
  } catch (err) {
    logger.error({ jobId: job.id, pdfId, err }, "Embedding job failed");
    throw err;
  }
}
