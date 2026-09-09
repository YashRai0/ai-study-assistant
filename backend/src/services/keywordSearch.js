// Lightweight BM25 keyword scoring, computed on the fly over whatever chunk
// set is already loaded for the current request — no inverted index to
// build or keep in sync. Same "in-memory, no separate service" tradeoff
// vectorStore.js documents for the vector side: fine at the chunk counts
// this project runs at (hundreds), the wrong approach at real
// search-engine scale (an actual index would precompute document
// frequencies once instead of on every query).

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "of", "in", "on", "at", "to", "for", "and", "or", "but", "if", "so",
  "with", "as", "by", "from", "this", "that", "these", "those", "it",
  "its", "do", "does", "did", "not", "no", "than", "then", "there",
  "what", "which", "who", "how", "why", "when", "where",
]);

export function tokenize(text) {
  const matches = (text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return matches.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

const K1 = 1.5;
const B = 0.75;

/**
 * BM25 score for each chunk against a (already-tokenized) query.
 * Returns a same-length array of raw, unbounded scores (0 for a chunk with
 * no matching terms) — the caller decides whether/how to normalize.
 */
export function bm25Scores(chunks, queryTokens) {
  const uniqueTerms = [...new Set(queryTokens)];
  if (!chunks.length || !uniqueTerms.length) return chunks.map(() => 0);

  const docs = chunks.map((c) => {
    const tokens = tokenize(c.text);
    const freq = new Map();
    for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
    return { freq, len: tokens.length };
  });

  const N = docs.length;
  const avgLen = docs.reduce((sum, d) => sum + d.len, 0) / N || 1;

  const documentFrequency = new Map();
  for (const term of uniqueTerms) {
    let count = 0;
    for (const d of docs) if (d.freq.has(term)) count += 1;
    documentFrequency.set(term, count);
  }

  return docs.map(({ freq, len }) => {
    const docLen = len || 1;
    let score = 0;
    for (const term of uniqueTerms) {
      const f = freq.get(term) || 0;
      if (!f) continue;
      const df = documentFrequency.get(term) || 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * (docLen / avgLen)));
    }
    return score;
  });
}

/** Fraction (0-1) of distinct query terms that appear anywhere in the text. */
export function queryCoverage(text, queryTokens) {
  const uniqueTerms = [...new Set(queryTokens)];
  if (!uniqueTerms.length) return 0;
  const present = new Set(tokenize(text));
  const hits = uniqueTerms.filter((t) => present.has(t)).length;
  return hits / uniqueTerms.length;
}

/** Whether the query appears in the text as a contiguous phrase, not just scattered terms. */
export function hasPhrase(text, query) {
  const normalizedQuery = (query || "").toLowerCase().trim();
  if (normalizedQuery.length < 4) return false; // too short to be a meaningful phrase match
  return (text || "").toLowerCase().includes(normalizedQuery);
}
