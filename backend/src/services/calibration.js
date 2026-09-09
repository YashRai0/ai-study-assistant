function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

/**
 * A single attempt's calibration gap: correctness minus normalized
 * confidence, both in [0, 1], so the gap sits in [-1, 1].
 *   gap << 0  → confident but wrong  → overconfidence
 *   gap >> 0  → unsure but right     → underconfidence
 *   gap ≈ 0   → confidence tracked correctness
 */
export function calibrationGap({ correctness, confidence }) {
  const c = clamp(Number(correctness), 0, 1);
  const conf = clamp(Number(confidence) / 5, 0, 1);
  return clamp(c - conf);
}

/**
 * Rolls a new attempt's gap into the running per-concept average, the same
 * incremental-mean pattern used for confidence/averageResponseTime in
 * services/mastery.js.
 */
export function updateCalibration(previousCalibration, previousAttempts, gap) {
  return clamp(((Number(previousCalibration) || 0) * previousAttempts + gap) / (previousAttempts + 1));
}

const OVERCONFIDENT_THRESHOLD = -0.3;
const UNDERCONFIDENT_THRESHOLD = 0.3;

/**
 * Only labels a concept once there's enough evidence (3+ attempts) — a
 * single lucky guess or one bad day shouldn't earn a label.
 */
export function calibrationLabel(calibration, attempts) {
  if (attempts < 3) return null;
  if (calibration <= OVERCONFIDENT_THRESHOLD) return "overconfident";
  if (calibration >= UNDERCONFIDENT_THRESHOLD) return "underconfident";
  return null;
}
