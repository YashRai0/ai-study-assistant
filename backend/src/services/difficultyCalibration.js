// Difficulty calibration: an author sets a question's difficulty (1-5)
// when it's created, but that's a guess — real students might find it
// much easier or harder than intended. This doesn't replace the author's
// estimate; it calibrates it against real attempt data, with more weight
// given to the observed data as more attempts accumulate.

// Below this many attempts, the observed pass rate is too noisy to trust
// much — a question that's had 2 attempts, both wrong, isn't reliably
// "very hard" yet; it might just be two unlucky guesses.
const FULL_CONFIDENCE_SAMPLE_SIZE = 30;

/**
 * Converts an observed pass rate (0-1, higher = easier) into the same 1-5
 * difficulty scale the author-assigned value uses, so the two are
 * directly comparable/blendable.
 */
function passRateToDifficultyScale(passRate) {
  // 1 = easiest (near-100% pass rate), 5 = hardest (near-0% pass rate) —
  // linear mapping, inverted since difficulty and pass rate move opposite
  // directions.
  return 5 - passRate * 4;
}

/**
 * Blends the author's static difficulty estimate with the empirically
 * observed one, using a sample-size-weighted shrinkage: with few
 * attempts, the result stays close to the author's estimate; as attempts
 * accumulate (up to FULL_CONFIDENCE_SAMPLE_SIZE), it shifts toward what
 * students are actually experiencing.
 *
 * Pure function — no DB access — so it's independently testable; the
 * caller is responsible for fetching attemptStats from DiagnosticQuestion.
 */
export function calibrateDifficulty({ staticDifficulty = 3, attemptStats = { total: 0, correct: 0 } }) {
  const { total, correct } = attemptStats;
  if (total <= 0) return { calibrated: staticDifficulty, confidence: 0, empirical: null };

  const passRate = correct / total;
  const empirical = passRateToDifficultyScale(passRate);
  const confidence = Math.min(1, total / FULL_CONFIDENCE_SAMPLE_SIZE);
  const calibrated = staticDifficulty * (1 - confidence) + empirical * confidence;

  return { calibrated, confidence, empirical, passRate };
}

/**
 * Returns a shallow copy of each question with `.difficulty` replaced by
 * its calibrated value — for use right before difficulty-aware selection
 * (e.g. cognitiveLevel.js's pickClosestLevel, which tiebreaks on
 * `.difficulty`), without needing that selection logic to know anything
 * about calibration itself, and without mutating the original documents
 * (callers may still want the raw author-assigned difficulty elsewhere).
 */
export function withCalibratedDifficulty(questions) {
  return questions.map((q) => ({
    ...q,
    difficulty: calibrateDifficulty({ staticDifficulty: q.difficulty, attemptStats: q.attemptStats }).calibrated,
  }));
}
