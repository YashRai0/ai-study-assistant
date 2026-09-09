// Bloom-style cognitive levels, low to high. Order matters — index is used
// as a distance metric when picking the closest available question to a
// student's current level.
export const LEVELS = ["recognition", "recall", "application", "analysis", "transfer"];

export function isValidLevel(level) {
  return LEVELS.includes(level);
}

/**
 * Maps a student's mastery of a concept to the cognitive level worth testing
 * next. Low mastery gets simple recognition/recall questions rather than
 * being thrown at an analysis question they have no foundation for; high
 * mastery moves toward application/transfer rather than staying on easy
 * recall forever.
 */
export function targetLevelForMastery(mastery) {
  const m = Math.max(0, Math.min(1, Number(mastery) || 0));
  if (m < 0.25) return "recognition";
  if (m < 0.45) return "recall";
  if (m < 0.65) return "application";
  if (m < 0.85) return "analysis";
  return "transfer";
}

/**
 * Picks the question whose cognitive level is closest to the target,
 * breaking ties by difficulty then recency. Question banks are often thin
 * (a concept may only have one or two questions at all), so this degrades
 * gracefully to "closest available" rather than requiring an exact level
 * match — the alternative would be no question at all.
 */
export function pickClosestLevel(questions, targetLevel) {
  if (!questions.length) return null;
  const targetIndex = LEVELS.indexOf(targetLevel);
  const ranked = questions.slice().sort((a, b) => {
    const da = Math.abs(LEVELS.indexOf(a.cognitiveLevel) - targetIndex);
    const db = Math.abs(LEVELS.indexOf(b.cognitiveLevel) - targetIndex);
    if (da !== db) return da - db;
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return ranked[0];
}
