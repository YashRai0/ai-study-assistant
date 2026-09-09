import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function StreakTracker({ courseId }) {
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    client
      .get(`/learning/courses/${courseId}/streak`)
      .then(({ data }) => setStreak(data.streak))
      .catch(() => setStreak(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading || !streak) return null;

  return (
    <div className="rounded-xl border border-highlight bg-highlight/10 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-600">Study streak</p>
          <p className="text-2xl font-bold text-ink-900">
            {streak.currentStreak} day{streak.currentStreak === 1 ? "" : "s"} 🔥
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-ink-600">Best: {streak.longestStreak} days</p>
          <p className="text-sm text-ink-600">This week: {streak.studyDaysThisWeek}/7</p>
        </div>
      </div>
    </div>
  );
}
