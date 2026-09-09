function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function explainNextBestAction({
  conceptName,
  mastery = 0,
  retention = 0,
  misconceptionRisk = 0,
  prerequisiteBlocked = false,
  dueForReview = false,
  recentFailureCount = 0,
} = {}) {
  const reasons = [];
  const m = clamp01(mastery);
  const r = clamp01(retention);
  const mr = clamp01(misconceptionRisk);

  if (prerequisiteBlocked) {
    reasons.push("A prerequisite needs attention before this concept.");
  }
  if (m < 0.5) reasons.push(`Mastery is currently ${Math.round(m * 100)}%.`);
  if (mr >= 0.5) reasons.push("A recurring misconception is affecting this concept.");
  if (dueForReview || r < 0.5) reasons.push("Retention is low or the concept is due for review.");
  if (recentFailureCount > 0) {
    reasons.push(`${recentFailureCount} recent unsuccessful attempt${recentFailureCount === 1 ? "" : "s"} ${recentFailureCount === 1 ? "was" : "were"} recorded.`);
  }
  if (!reasons.length) reasons.push("This is the highest-value next action from the current learning state.");

  return {
    conceptName: conceptName || "this concept",
    reasons,
    summary: reasons.join(" "),
    source: "student-model",
  };
}
