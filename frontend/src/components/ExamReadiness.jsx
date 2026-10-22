import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function ExamReadiness({ courseId }) {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    client
      .get(`/learning/courses/${courseId}/readiness`)
      .then(({ data }) => setReadiness(data.readiness))
      .catch(() => setReadiness(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="flex h-full flex-col justify-between rounded-2xl border border-ink-100 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-4 w-28 rounded bg-ink-100" />
        <div className="mx-auto my-6 h-32 w-32 rounded-full bg-ink-100" />
        <div className="h-3 w-40 rounded bg-ink-100" />
      </div>
    );
  }

  if (!readiness) return null;

  const pct = Math.max(0, Math.min(100, readiness.readyPercent || 0));
  // Circle geometry for SVG gauge (radius = 48)
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  const getGradientColors = (percent) => {
    if (percent >= 80) return { start: "#10b981", end: "#059669", text: "text-emerald-600" };
    if (percent >= 60) return { start: "#f59e0b", end: "#d97706", text: "text-amber-600" };
    return { start: "#6366f1", end: "#4f46e5", text: "text-indigo-600" };
  };

  const colors = getGradientColors(pct);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-ink-100 bg-gradient-to-b from-white via-paper/40 to-white dark:from-[#1b233a] dark:via-[#161e33] dark:to-[#1b233a] dark:border-[#273352] p-6 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Target Readiness</span>
          <h3 className="font-display text-base font-bold text-ink-900">Exam Preparedness</h3>
        </div>
        {readiness.daysUntilExam !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-ink-100 bg-ink-50/80 px-2.5 py-1 text-xs font-semibold text-ink-700">
            <span>📅</span>
            <span>{readiness.daysUntilExam}d left</span>
          </span>
        )}
      </div>

      {/* Radial Gauge */}
      <div className="my-4 flex items-center justify-center">
        <div className="relative flex items-center justify-center">
          <svg className="h-36 w-36 -rotate-90 transform" viewBox="0 0 120 120">
            <defs>
              <linearGradient id={`radial-grad-${courseId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={colors.start} />
                <stop offset="100%" stopColor={colors.end} />
              </linearGradient>
            </defs>
            {/* Background Track */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke="currentColor"
              strokeWidth="9"
              className="text-ink-100"
              fill="transparent"
            />
            {/* Animated Gauge Ring */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke={`url(#radial-grad-${courseId})`}
              strokeWidth="9"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          </svg>

          {/* Central Percentage */}
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
              {pct}%
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">
              Score
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Summary Stats */}
      <div className="space-y-2 border-t border-ink-100/70 pt-3 text-xs">
        <div className="flex items-center justify-between font-medium text-ink-600">
          <span>Mastered concepts:</span>
          <span className="font-bold text-ink-900">{readiness.conceptsReady} of {readiness.conceptsTotal}</span>
        </div>
        <div className="flex items-center justify-between font-medium text-ink-600">
          <span>Attempted coverage:</span>
          <span className="font-bold text-ink-900">{readiness.coveragePercent}%</span>
        </div>
        {readiness.message && (
          <p className="pt-1 text-[11px] leading-relaxed text-ink-500 line-clamp-2">
            {readiness.message}
          </p>
        )}
      </div>
    </div>
  );
}
