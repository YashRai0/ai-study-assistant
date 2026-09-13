// Retrieval evaluation: the thing the very first review of this codebase
// pushed back on doing without — "you shouldn't optimize retrieval
// blindly... build a small evaluation set, then measure vector vs BM25
// vs hybrid vs hybrid+rerank, [and] make engineering decisions from
// data." This is that harness: pure metrics (fully testable with
// synthetic data, no DB or embedding model needed) plus a
// strategy-comparison function that runs the real retrieval code paths
// against real chunks (needs a DB connection and the embedding model —
// see scripts/evaluateRetrieval.js for the runnable CLI version, and its
// comment for why that script itself can't be executed in this sandbox).
import { retrieveTopK, cosineSimilarity } from "./vectorStore.js";
import { tokenize, bm25Scores } from "./keywordSearch.js";
import { hybridRetrieve, hybridRetrieveWithNeuralRerank } from "./hybridRetrieval.js";

/**
 * Fraction of the known-relevant chunks for this query that appear
 * anywhere in the top K retrieved results. Requires relevantIds to be
 * non-empty (a query with no labeled ground truth can't have a
 * meaningful recall score) — callers should skip those queries entirely
 * rather than pass an empty array here, since 0/0 recall is not the same
 * thing as "retrieved nothing relevant."
 */
export function recallAtK(retrievedIds, relevantIds, k) {
  if (!relevantIds?.length) return null;
  const topK = new Set(retrievedIds.slice(0, k).map(String));
  const hits = relevantIds.filter((id) => topK.has(String(id))).length;
  return hits / relevantIds.length;
}

/** Fraction of the top K retrieved results that are actually relevant. */
export function precisionAtK(retrievedIds, relevantIds, k) {
  const topK = retrievedIds.slice(0, k).map(String);
  if (!topK.length) return 0;
  const relevantSet = new Set((relevantIds || []).map(String));
  const hits = topK.filter((id) => relevantSet.has(id)).length;
  return hits / topK.length;
}

/**
 * Reciprocal of the rank of the first relevant result (1/1 if the very
 * first result is relevant, 1/2 if the second is the first relevant one,
 * etc.), or 0 if nothing relevant was retrieved at all. Unlike
 * recall/precision, this considers the *entire* retrievedIds list, not
 * just the top K — MRR is about how far down a user has to scroll before
 * hitting something useful, not about a fixed cutoff.
 */
export function reciprocalRank(retrievedIds, relevantIds) {
  const relevantSet = new Set((relevantIds || []).map(String));
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevantSet.has(String(retrievedIds[i]))) return 1 / (i + 1);
  }
  return 0;
}

/**
 * Aggregates per-query results (each {retrievedIds, relevantIds, k}) into
 * summary metrics for one retrieval strategy. Queries with no ground
 * truth (empty/missing relevantIds) are excluded from the average rather
 * than counted as a zero score, since "no labeled answer for this query"
 * and "retrieved nothing relevant" are different things and conflating
 * them would understate a strategy that's actually performing fine on
 * the queries that do have labels.
 */
export function summarizeRun(results) {
  const labeled = (results || []).filter((r) => r.relevantIds?.length);
  if (!labeled.length) return null;

  const avg = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    sampleSize: labeled.length,
    recallAtK: avg(labeled.map((r) => recallAtK(r.retrievedIds, r.relevantIds, r.k))),
    precisionAtK: avg(labeled.map((r) => precisionAtK(r.retrievedIds, r.relevantIds, r.k))),
    mrr: avg(labeled.map((r) => reciprocalRank(r.retrievedIds, r.relevantIds))),
  };
}

/** BM25-only baseline — no equivalent existed anywhere else in the
 * codebase (keywordSearch.js only exports the scoring primitive, not a
 * top-K retriever), added here specifically so keyword-only can be
 * compared against vector-only and hybrid on equal footing. */
export function keywordOnlyRetrieve(chunks, query, k = 4) {
  if (!chunks.length || k <= 0) return [];
  const queryTokens = tokenize(query);
  const scores = bm25Scores(chunks, queryTokens);
  return chunks
    .map((c, i) => ({ ...c, score: scores[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/**
 * Runs every retrieval strategy worth comparing against the same chunks
 * and query, returning each strategy's ranked chunk IDs. Doesn't compute
 * metrics itself (needs relevantIds from an eval set for that, via
 * summarizeRun above) — this just produces the raw rankings to compare.
 *
 * `includeNeuralRerank` defaults to false: it makes a real LLM call per
 * query (see hybridRetrieveWithNeuralRerank), so running it across a
 * 100-query eval set has real cost/latency that a quick comparison run
 * shouldn't incur by default.
 */
export async function compareStrategies({ chunks, query, queryEmbedding, k = 4, includeNeuralRerank = false }) {
  const vectorOnly = retrieveTopK(chunks, queryEmbedding, k);
  const keywordOnly = keywordOnlyRetrieve(chunks, query, k);
  const hybrid = hybridRetrieve(chunks, query, queryEmbedding, k);

  const strategies = {
    vectorOnly: vectorOnly.map((c) => String(c._id)),
    keywordOnly: keywordOnly.map((c) => String(c._id)),
    hybrid: hybrid.map((c) => String(c._id)),
  };

  if (includeNeuralRerank) {
    const reranked = await hybridRetrieveWithNeuralRerank(chunks, query, queryEmbedding, k);
    strategies.hybridWithNeuralRerank = reranked.map((c) => String(c._id));
  }

  return strategies;
}
