// Local embedding model via @xenova/transformers — runs in-process, no API
// key, no extra infra. Uses a small, fast sentence embedding model.
// This fills a gap the original PRD left open (no embedding model was named).

import { pipeline } from "@xenova/transformers";

let embedderPromise = null;

function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return embedderPromise;
}

/**
 * Returns a normalized embedding vector (array of numbers) for a piece of text.
 */
export async function embedText(text) {
  const embedder = await getEmbedder();
  const output = await embedder(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Embeds an array of text chunks with controlled, bounded concurrency (Step 7).
 * Keeps memory bounded while dramatically improving throughput compared to
 * strictly sequential processing.
 */
export async function embedChunks(
  chunks,
  {
    concurrency = Number(process.env.EMBEDDING_CONCURRENCY) || 4,
    batchSize = Number(process.env.EMBEDDING_BATCH_SIZE) || 8,
  } = {}
) {
  if (!chunks || !chunks.length) return [];

  const results = new Array(chunks.length);
  const boundedConcurrency = Math.max(1, Math.min(concurrency, chunks.length));

  // Process through bounded worker pool to prevent unlimited parallel promises
  let cursor = 0;
  async function worker() {
    while (cursor < chunks.length) {
      const idx = cursor++;
      results[idx] = await embedText(chunks[idx]);
    }
  }

  const workers = Array.from({ length: boundedConcurrency }, () => worker());
  await Promise.all(workers);
  return results;
}
