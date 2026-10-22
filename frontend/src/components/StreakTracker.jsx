import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function StreakTracker({ courseId }) {
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    client
      .get(`/learning/courses/${courseId}/streak`)
      .then(({ data }) => setStreak(data.streak))
      .catch(() => setStreak(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading || !streak) return null;

  const daysThisWeek = Math.min(7, Math.max(0, streak.studyDaysThisWeek || 0));

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 p-5 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-800/80">Study Momentum</span>
        <span className="text-xl">🔥</span>
      </div>

      <div className="my-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
            {streak.currentStreak}
          </span>
          <span className="text-xs font-bold text-amber-700">
            day streak
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-500">
          Personal best: <strong className="text-ink-800">{streak.longestStreak} days</strong>
        </p>
      </div>

      {/* 7-Day Consistency Dot Matrix */}
      <div className="border-t border-amber-100/80 pt-3">
        <div className="flex items-center justify-between text-[11px] text-ink-600 font-medium">
          <span>Weekly target:</span>
          <span className="font-bold text-ink-900">{daysThisWeek} of 7 days</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-1.5">
          {[...Array(7)].map((_, i) => {
            const active = i < daysThisWeek;
            return (
              <div
                key={i}
                title={`Day ${i + 1}: ${active ? "Completed" : "Pending"}`}
                className={`h-2 flex-1 rounded-full transition-all ${
                  active
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 shadow-xs"
                    : "bg-ink-100"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
