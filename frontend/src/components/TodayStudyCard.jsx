import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";

const ACTION_CONFIG = {
  MISCONCEPTION_FIX: {
    label: "Misconception Repair",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    defaultIcon: "⚠️",
  },
  PREREQUISITE_GAP: {
    label: "Foundational Gap",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    defaultIcon: "🧱",
  },
  TEACH: {
    label: "Core Learning Target",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    defaultIcon: "📖",
  },
  REVIEW: {
    label: "Spaced Review Due",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200",
    dotClass: "bg-purple-500",
    defaultIcon: "🔄",
  },
  TEST: {
    label: "Self-Test Challenge",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dotClass: "bg-emerald-500",
    defaultIcon: "🎯",
  },
  PRACTICE: {
    label: "Practice & Reinforce",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
    dotClass: "bg-indigo-500",
    defaultIcon: "✍️",
  },
  DIAGNOSTIC: {
    label: "Initial Diagnostic",
    badgeClass: "bg-ink-100 text-ink-700 border-ink-200",
    dotClass: "bg-ink-500",
    defaultIcon: "🧭",
  },
};

export default function TodayStudyCard({ courseId, courseTitle }) {
  const [action, setAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    setError(false);
    client
      .get(`/learning/courses/${courseId}/next-action`)
      .then(({ data }) => setAction(data.action))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white/80 p-6 shadow-sm animate-pulse">
        <div className="h-4 w-32 rounded bg-ink-100 mb-3" />
        <div className="h-6 w-64 rounded bg-ink-200 mb-2" />
        <div className="h-4 w-96 rounded bg-ink-100" />
      </div>
    );
  }

  if (error || !action) return null;

  const config = ACTION_CONFIG[action.type] || ACTION_CONFIG.PRACTICE;
  const isDiagnostic = action.type === "DIAGNOSTIC";
  const concept = action.concept;
  const masteryPct = concept ? Math.round((concept.mastery || 0) * 100) : 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-ink-100 bg-gradient-to-br from-white via-paper to-white p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
              {config.label}
            </span>
            {courseTitle && (
              <span className="text-xs font-medium text-ink-400">
                Course: <strong className="text-ink-700">{courseTitle}</strong>
              </span>
            )}
          </div>

          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900">
              {isDiagnostic ? "Find Your Starting Baseline" : concept?.name || "Next Concept"}
            </h2>
            <p className="mt-1 text-sm text-ink-600 leading-relaxed">
              {action.explanation?.summary || action.reason || "Recommended next step based on your learning trajectory."}
            </p>
          </div>

          {!isDiagnostic && concept && (
            <div className="flex items-center gap-3 pt-1">
              <div className="h-2 w-36 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(5, masteryPct)}%`,
                    backgroundColor: masteryPct >= 80 ? "#10b981" : masteryPct >= 50 ? "#f59e0b" : "#6366f1",
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-ink-500">{masteryPct}% Mastered</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 shrink-0 sm:items-end">
          {isDiagnostic ? (
            <Link
              to={`/diagnostic?course=${courseId}`}
              className="inline-flex items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow hover:bg-ink-800 transition"
            >
              Take 5-min Diagnostic →
            </Link>
          ) : (
            <>
              <Link
                to={`/study-session?course=${courseId}&minutes=15`}
                className="inline-flex items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow hover:bg-ink-800 transition"
              >
                Start Focused Session (15m) →
              </Link>
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <span>Or:</span>
                <Link
                  to={`/study-session?course=${courseId}&minutes=25`}
                  className="underline hover:text-ink-900"
                >
                  25 min
                </Link>
                <span>·</span>
                <Link
                  to={`/study?course=${courseId}`}
                  className="underline hover:text-ink-900"
                >
                  Full course view
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
