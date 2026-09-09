import StudentConcept from "../models/StudentConcept.js";

/**
 * Ebbinghaus Forgetting Curve: R(t) = e^(-t/S)
 * R = retention probability (0-1)
 * t = time since review (days)
 * S = strength factor (depends on mastery)
 */
/**
 * The raw Ebbinghaus retention fraction R(t) = e^(-t/S), 0–1, where 1 means
 * nothing has been forgotten yet and 0 means fully forgotten. Split out
 * from calculateRetention() (which returns effective mastery = fraction ×
 * original mastery) because forgettingRisk in mastery.js needs the
 * fraction itself, not mastery scaled by it twice over.
 */
function retentionFraction(masteryAtReview, daysSinceReview) {
  if (daysSinceReview <= 0) return 1;
  const S = Math.max(1, masteryAtReview * 30);
  return Math.exp(-daysSinceReview / S);
}

function calculateRetention(masteryAtReview, daysSinceReview) {
  return masteryAtReview * retentionFraction(masteryAtReview, daysSinceReview);
}

// Calculate how many review sessions needed
function reviewsNeeded(currentMastery, targetMastery) {
  if (currentMastery >= targetMastery) return 0;
  if (currentMastery === 0) return 5; // Complete unknown
  
  // Spaced repetition: each review amplifies mastery
  // Session mastery gain ≈ (1 - current) * 0.3 per correct attempt
  let estimated = currentMastery;
  let sessions = 0;
  
  while (estimated < targetMastery && sessions < 20) {
    estimated = Math.min(1, estimated + (1 - estimated) * 0.3);
    sessions++;
  }
  
  return sessions;
}

// Calculate next optimal review time
export function calculateNextReviewDate(mastery, lastAttemptDate) {
  const targetMastery = 0.9;
  if (!lastAttemptDate) return new Date(); // Study now if never attempted
  
  const daysSinceLast = (Date.now() - new Date(lastAttemptDate).getTime()) / (1000 * 60 * 60 * 24);
  const currentRetention = calculateRetention(mastery, daysSinceLast);
  
  // If retention is still high, can wait longer
  if (currentRetention >= 0.8) {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  } else if (currentRetention >= 0.5) {
    return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 days
  } else if (currentRetention >= 0.2) {
    return new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day
  } else {
    return new Date(); // Review now
  }
}

// Calculate readiness score (0-1) accounting for forgetting
export async function calculateReadiness(userId, conceptId) {
  const sc = await StudentConcept.findOne({ user: userId, concept: conceptId }).lean();
  if (!sc) return 0;
  
  const daysSinceLast = sc.lastReviewedAt
    ? (Date.now() - new Date(sc.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24)
    : null;
  
  if (daysSinceLast === null) return 0;
  
  const effectiveMastery = calculateRetention(sc.mastery || 0, daysSinceLast);
  
  // Readiness score: combination of mastery and recency
  // High mastery + recently reviewed = ready
  // High mastery + long time ago = needs review
  const readiness = effectiveMastery * Math.max(0.1, 1 - daysSinceLast / 60);
  
  return Math.min(1, readiness);
}

export { calculateRetention, reviewsNeeded, retentionFraction };
