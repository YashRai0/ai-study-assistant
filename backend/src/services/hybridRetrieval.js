// Hybrid retrieval: blends vector (cosine) similarity with BM25 keyword
// scoring, then reranks a widened candidate pool with a couple of cheap
// heuristic signals a similarity score alone tends to miss.
//
// hybridRetrieve() below is deliberately NOT a neural cross-encoder
// reranker — downloading and running a separate model (e.g. via
// @xenova/transformers, same as embeddings.js) isn't something to bolt on
// without the ability to actually verify it runs in this environment. It's
// pure JS, has no model to download, and is fully unit-testable with
// synthetic data — which is what every caller currently uses, since it's
// synchronous and cheap enough to run on every chat message.
//
// hybridRetrieveWithNeuralRerank() further down IS a real neural rerank
// stage — using the LLM this codebase already calls everywhere else as
// the relevance scorer, rather than a separately-hosted cross-encoder.
// It's opt-in, not the default: it makes an LLM call, so it has real
// latency/cost that shouldn't land on every message by default.
import { cosineSimilarity } from "./vectorStore.js";
import { tokenize, bm25Scores, queryCoverage, hasPhrase } from "./keywordSearch.js";
import { rerankByRelevance } from "./llm.js";

const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;
// Widen past k before reranking, so the rerank step has real alternatives
// to promote instead of just reshuffling the same k chunks vector search
// alone would have picked.
const CANDIDATE_POOL_MULTIPLIER = 4;

function minMaxNormalize(scores) {
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min;
  if (!Number.isFinite(range) || range <= 1e-9) return scores.map(() => 0);
  return scores.map((s) => (s - min) / range);
}

/**
 * @param {Array<{text: string, embedding: number[]}>} chunks
 * @param {string} query - the student's raw question, used for keyword scoring
 * @param {number[]} queryEmbedding
 * @param {number} k
 * @returns chunks (embedding stripped) with a `score` field — the raw
 *   cosine similarity, preserved unchanged so bestScore()/SIMILARITY_THRESHOLD
 *   gating in the routes keeps meaning what it's always meant, even though
 *   the *ordering* below now reflects the hybrid+rerank pass.
 */
export function hybridRetrieve(chunks, query, queryEmbedding, k = 4) {
  if (!chunks.length || k <= 0) return [];

  const vectorScores = chunks.map((c) => cosineSimilarity(c.embedding, queryEmbedding));
  const queryTokens = tokenize(query);
  const keywordScores = bm25Scores(chunks, queryTokens);

  const normVector = minMaxNormalize(vectorScores);
  const normKeyword = minMaxNormalize(keywordScores);

  const candidates = chunks.map((chunk, i) => {
    const { embedding, ...rest } = chunk;
    return {
      ...rest,
      score: vectorScores[i],
      hybridScore: VECTOR_WEIGHT * normVector[i] + KEYWORD_WEIGHT * normKeyword[i],
    };
  });

  candidates.sort((a, b) => b.hybridScore - a.hybridScore);
  const poolSize = Math.min(candidates.length, Math.max(k * CANDIDATE_POOL_MULTIPLIER, k));
  const pool = candidates.slice(0, poolSize);

  // Heuristic rerank: a chunk covering more of the distinct query terms, or
  // containing the question as a near-exact phrase, is often the one a
  // human would pick even when its embedding similarity is a notch below
  // another chunk's — cosine similarity alone can miss that.
  const reranked = pool.map((c) => {
    const coverage = queryCoverage(c.text, queryTokens);
    const phraseBonus = hasPhrase(c.text, query) ? 0.1 : 0;
    return { ...c, rerankScore: c.hybridScore + coverage * 0.15 + phraseBonus };
  });
  reranked.sort((a, b) => b.rerankScore - a.rerankScore);

  return reranked.slice(0, k).map(({ hybridScore, rerankScore, ...rest }) => rest);
}

/**
 * Same retrieval as hybridRetrieve, but with an added neural (LLM-based)
 * reranking pass on top of the heuristic one — see rerankByRelevance() in
 * llm.js for why an LLM call is what "neural reranker" means in this
 * codebase rather than a separately-hosted cross-encoder model.
 *
 * Deliberately a separate function rather than a flag on hybridRetrieve:
 * this makes an LLM call, so it has real latency and cost that every
 * existing caller of hybridRetrieve (chat, multi-chat, groups, search —
 * all four currently synchronous, per-message calls) shouldn't suddenly
 * incur by default. Callers that want the extra quality for a specific,
 * lower-volume use case opt into this one explicitly.
 *
 * Pulls a wider candidate pool from the heuristic pass (poolMultiplier×k)
 * before reranking, so the LLM has more than just the final k to choose
 * from — reranking only among candidates already narrowed to exactly k
 * would defeat the point.
 */
export async function hybridRetrieveWithNeuralRerank(chunks, query, queryEmbedding, k = 4, { poolMultiplier = 3 } = {}) {
  const pool = hybridRetrieve(chunks, query, queryEmbedding, k * poolMultiplier);
  if (!pool.length) return [];
  const reranked = await rerankByRelevance(query, pool, { topK: k });
  return reranked.map(({ relevanceScore, ...rest }) => rest);
}
