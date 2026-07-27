// Minimal in-memory vector store using cosine similarity.
// v1 simplification in place of ChromaDB/FAISS: no separate service to run,
// which matters for a 3-4 day build. The interface below (upsert + query)
// mirrors what a real vector DB client looks like, so swapping in ChromaDB
// later means changing this file only, not the routes that call it.
//
// SCALING NOTE: even with the heap-based top-k below, this is still a
// brute-force O(n) comparison against every chunk on every query — fine at
// hundreds of chunks (a few dozen PDFs), the wrong approach at tens of
// thousands. A real deployment with many users/PDFs needs an actual ANN
// index (pgvector, Pinecone, a self-hosted ChromaDB/FAISS index, etc.) doing
// approximate search instead of exact comparison against every chunk. Not
// implemented here — it's a real infrastructure addition (a service to run
// and keep in sync), not a small code change, and out of scope for this
// project's current size.

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

// Bounded min-heap of size k, so finding the top-k out of n scored chunks is
// O(n log k) instead of O(n log n) from sorting everything and slicing —
// worthwhile once k (typically 4-8) is much smaller than n (chunk count).
class MinHeap {
  constructor() {
    this.items = [];
  }
  size() {
    return this.items.length;
  }
  peek() {
    return this.items[0];
  }
  push(item) {
    this.items.push(item);
    this._bubbleUp(this.items.length - 1);
  }
  replaceMin(item) {
    this.items[0] = item;
    this._bubbleDown(0);
  }
  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].score <= this.items[i].score) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }
  _bubbleDown(i) {
    const n = this.items.length;
    for (;;) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.items[left].score < this.items[smallest].score) smallest = left;
      if (right < n && this.items[right].score < this.items[smallest].score) smallest = right;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}

/**
 * Finds the top-k most relevant chunks for a query embedding.
 * Any extra fields on a chunk object (e.g. pdfId, filename, subject) pass
 * through to the result — this is what lets semantic search across many
 * documents report which PDF/subject each match came from.
 * @param {Array<{text: string, embedding: number[]}>} chunks
 * @param {number[]} queryEmbedding
 * @param {number} k
 */
export function retrieveTopK(chunks, queryEmbedding, k = 4) {
  if (k <= 0) return [];

  const heap = new MinHeap();
  for (const chunk of chunks) {
    const { embedding, ...rest } = chunk;
    const score = cosineSimilarity(embedding, queryEmbedding);
    const item = { ...rest, score };

    if (heap.size() < k) {
      heap.push(item);
    } else if (score > heap.peek().score) {
      heap.replaceMin(item);
    }
  }

  // The heap only guarantees the k best scores are present, not that
  // they're sorted — sorting just those k (not all n) is what keeps this
  // O(n log k + k log k) instead of O(n log n).
  return heap.items.sort((a, b) => b.score - a.score);
}

// Below this cosine similarity, retrieved chunks are too weak a match to
// answer from confidently — without this, a question with no real match in
// the notes still got the top-4 chunks handed to the LLM regardless of how
// irrelevant they were, and the model would sometimes strain to answer from
// them anyway instead of saying it couldn't find the information.
//
// 0.3 is a starting point for all-MiniLM-L6-v2 (the embedding model this
// project uses) — genuinely relevant chunks against a real question
// typically land noticeably higher than unrelated ones, but this threshold
// hasn't been tuned against real usage data. Overridable via the
// SIMILARITY_THRESHOLD env var so it can be tuned without a code change; if
// real usage shows too many false "couldn't find this" responses, lower it,
// if it shows confidently-wrong answers on off-topic questions, raise it.
const configuredThreshold = parseFloat(process.env.SIMILARITY_THRESHOLD);
export const SIMILARITY_THRESHOLD = Number.isFinite(configuredThreshold) ? configuredThreshold : 0.3;

export function bestScore(results) {
  return results[0]?.score ?? 0;
}
