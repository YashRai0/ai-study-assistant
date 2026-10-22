/**
 * Diagnostic test adaptive logic and certificate calculations
 */

export function calculateDiagnosticScore(answeredCount, correctCount) {
  if (!answeredCount || answeredCount <= 0) return 0;
  const count = Math.min(Math.max(correctCount || 0, 0), answeredCount);
  return Math.round((count / answeredCount) * 100);
}

export function getDifficultyLabel(difficulty) {
  const d = Math.max(1, Math.min(5, Math.round(Number(difficulty) || 1)));
  switch (d) {
    case 1:
      return { level: 1, label: "Foundational", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    case 2:
      return { level: 2, label: "Core", color: "text-sky-700 bg-sky-50 border-sky-200" };
    case 3:
      return { level: 3, label: "Intermediate", color: "text-indigo-700 bg-indigo-50 border-indigo-200" };
    case 4:
      return { level: 4, label: "Advanced", color: "text-violet-700 bg-violet-50 border-violet-200" };
    case 5:
      return { level: 5, label: "Mastery", color: "text-amber-700 bg-amber-50 border-amber-200" };
    default:
      return { level: 1, label: "Foundational", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  }
}

export function getCognitiveBadge(cognitiveLevel) {
  const level = String(cognitiveLevel || "understand").toLowerCase().trim();
  switch (level) {
    case "remember":
      return { label: "Recall", bg: "bg-slate-100 text-slate-700 border-slate-200" };
    case "understand":
      return { label: "Comprehension", bg: "bg-blue-50 text-blue-700 border-blue-200" };
    case "apply":
      return { label: "Application", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "analyze":
      return { label: "Analysis", bg: "bg-purple-50 text-purple-700 border-purple-200" };
    case "evaluate":
      return { label: "Evaluation", bg: "bg-amber-50 text-amber-700 border-amber-200" };
    case "create":
      return { label: "Synthesis", bg: "bg-rose-50 text-rose-700 border-rose-200" };
    default:
      return { label: level.charAt(0).toUpperCase() + level.slice(1), bg: "bg-slate-100 text-slate-700 border-slate-200" };
  }
}

export function getConfidenceFeedback(confidence, isCorrect) {
  const conf = Math.max(1, Math.min(5, Number(confidence) || 3));
  if (isCorrect) {
    if (conf >= 4) {
      return {
        type: "calibrated-high",
        headline: "High Confidence Mastery",
        note: "Your calibrated confidence matches strong conceptual mastery.",
        badge: "bg-emerald-100 text-emerald-800"
      };
    }
    return {
      type: "under-confident",
      headline: "Intuitive Grasp",
      note: "You answered correctly despite feeling uncertain. Practice will turn this into high confidence.",
      badge: "bg-sky-100 text-sky-800"
    };
  }

  // Incorrect answer
  if (conf >= 4) {
    return {
      type: "over-confident-misconception",
      headline: "Misconception Alert",
      note: "High confidence error detected. This indicates an active misconception to prioritize in study sessions.",
      badge: "bg-rose-100 text-rose-800"
    };
  }

  return {
    type: "expected-gap",
    headline: "Identified Growth Area",
    note: "Recognizing uncertainty is part of effective metacognition. This gap has been added to your focus queue.",
    badge: "bg-amber-100 text-amber-800"
  };
}

export function generateDiagnosticCertificateData({ courseTitle, answeredCount, scorePercentage, durationMinutes = 5 }) {
  const score = Math.max(0, Math.min(100, Number(scorePercentage) || 0));
  let tier = "Foundation";
  let tierColor = "text-amber-600 border-amber-300 bg-amber-50";
  let readinessStatement = "Ready for foundational review and guided spaced repetitions.";

  if (score >= 85) {
    tier = "Advanced Scholar";
    tierColor = "text-emerald-700 border-emerald-300 bg-emerald-50";
    readinessStatement = "Exceptional baseline! Recommended to jump directly into higher-order analysis and exam simulation.";
  } else if (score >= 70) {
    tier = "Proficient";
    tierColor = "text-indigo-700 border-indigo-300 bg-indigo-50";
    readinessStatement = "Strong baseline. Target specific weak-link concepts with 25-minute Pomodoro focus blocks.";
  } else if (score >= 50) {
    tier = "Intermediate Developing";
    tierColor = "text-sky-700 border-sky-300 bg-sky-50";
    readinessStatement = "Consistent starting point. Focus on core concept reviews and tactile flashcard drills.";
  }

  return {
    id: `DIAG-${Date.now().toString(36).toUpperCase()}`,
    courseTitle: courseTitle || "Course Baseline",
    answeredCount: answeredCount || 0,
    scorePercentage: score,
    tier,
    tierColor,
    readinessStatement,
    issuedDate: new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    durationMinutes
  };
}
