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
 * Embeds an array of text chunks sequentially.
 * (Sequential keeps memory bounded for a student-project-sized deployment;
 * batch it if you need more throughput later.)
 */
export async function embedChunks(chunks) {
  const embeddings = [];
  for (const chunk of chunks) {
    embeddings.push(await embedText(chunk));
  }
  return embeddings;
}
