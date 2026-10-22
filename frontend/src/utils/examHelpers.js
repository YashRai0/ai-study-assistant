/**
 * Exam Simulation and Diagnostic helpers
 */

export function formatExamTimer(ms) {
  if (isNaN(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function getTimerUrgency(remainingMs, totalDurationMs = 1800000) {
  if (!remainingMs || remainingMs <= 0) return "expired";
  // Under 2 minutes is critical, under 5 minutes or under 20% is warning
  if (remainingMs <= 120000) return "critical";
  if (remainingMs <= 300000 || (totalDurationMs && remainingMs / totalDurationMs <= 0.2)) return "warning";
  return "normal";
}

export function toggleFlaggedQuestion(flaggedArray = [], questionId) {
  if (!questionId) return [...flaggedArray];
  if (flaggedArray.includes(questionId)) {
    return flaggedArray.filter((id) => id !== questionId);
  }
  return [...flaggedArray, questionId];
}

export function predictGradeBand(overallPct) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(overallPct) || 0)));
  if (pct >= 92) {
    return { band: "A+ (High Distinction)", badgeColor: "text-emerald-700 bg-emerald-50 border-emerald-300", summary: "Mastery demonstrated across all cognitive tiers." };
  }
  if (pct >= 83) {
    return { band: "A (Distinction)", badgeColor: "text-indigo-700 bg-indigo-50 border-indigo-300", summary: "Strong command of core mechanisms with minor edge case gaps." };
  }
  if (pct >= 72) {
    return { band: "B (Merit)", badgeColor: "text-sky-700 bg-sky-50 border-sky-300", summary: "Solid foundational knowledge. Recommended targeted practice on application problems." };
  }
  if (pct >= 60) {
    return { band: "C (Pass)", badgeColor: "text-amber-700 bg-amber-50 border-amber-300", summary: "Passing baseline. Focus on high-risk misconceptions before examination." };
  }
  return { band: "Developing", badgeColor: "text-rose-700 bg-rose-50 border-rose-300", summary: "Immediate review recommended. Prioritize core definitions and prerequisite concepts." };
}

export function calculateCognitivePerformance(items = []) {
  if (!items || items.length === 0) return [];
  const map = {};

  items.forEach((item) => {
    const level = (item.cognitiveLevel || "understand").toLowerCase();
    if (!map[level]) {
      map[level] = { total: 0, correct: 0 };
    }
    map[level].total += 1;
    if (item.correct) {
      map[level].correct += 1;
    }
  });

  return Object.entries(map).map(([domain, data]) => {
    const pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
    return {
      domain: domain.charAt(0).toUpperCase() + domain.slice(1),
      total: data.total,
      correct: data.correct,
      percentage: pct,
    };
  });
}
