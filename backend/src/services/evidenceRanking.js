const EVIDENCE_STOPWORDS = new Set([
  "what", "which", "where", "when", "why", "how", "does", "would", "could", "should",
  "this", "that", "these", "those", "from", "into", "with", "about", "have", "has", "been",
  "being", "than", "then", "their", "there", "they", "them", "your", "true", "false", "answer",
  "according", "describe", "explain", "following", "example", "examples", "question", "questions",
]);

function normalizeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function evidenceTokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !EVIDENCE_STOPWORDS.has(token));
}

export function rankEvidenceChunks({ conceptName, aliases = [], chunks = [], limit = 10 }) {
  const phrases = [conceptName, ...aliases].map(normalizeName).filter(Boolean);
  const queryTokens = new Set(phrases.flatMap(evidenceTokens));
  if (!queryTokens.size || !chunks.length) return [];

  return chunks.map((chunk) => {
    const text = normalizeName(chunk.text || "");
    const chunkTokens = new Set(evidenceTokens(chunk.text));
    let overlap = 0;
    let prefixOverlap = 0;
    for (const token of queryTokens) {
      if (chunkTokens.has(token)) overlap += 1;
      else if ([...chunkTokens].some((candidate) => candidate.length >= 5 && (candidate.startsWith(token) || token.startsWith(candidate) || (token.length >= 6 && candidate.length >= 6 && token.slice(0, 4) === candidate.slice(0, 4))))) prefixOverlap += 1;
    }
    const phraseHits = phrases.reduce((count, phrase) => count + (phrase.length >= 6 && text.includes(phrase) ? 1 : 0), 0);
    const distinctive = [...queryTokens].filter((token) => token.length >= 7 && chunkTokens.has(token)).length;
    const score = phraseHits * 5 + overlap + prefixOverlap * 0.35 + distinctive * 0.5;
    const meaningful = phraseHits > 0 || overlap >= 2 || (overlap >= 1 && (distinctive >= 1 || queryTokens.size >= 2)) || prefixOverlap >= 1;
    return { chunk, score, overlap, phraseHits, meaningful };
  })
    .filter((item) => item.meaningful)
    .sort((a, b) => b.score - a.score || b.overlap - a.overlap || String(a.chunk._id).localeCompare(String(b.chunk._id)))
    .slice(0, limit);
}
