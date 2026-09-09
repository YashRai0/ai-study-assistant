import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function ExamReadiness({ courseId }) {
  const [readiness, setReadiness] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!courseId) return;
    client
      .get(`/learning/courses/${courseId}/readiness`)
      .then(({ data }) => setReadiness(data.readiness))
      .catch(() => setReadiness(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  if (loading) return <p className="text-ink-400">Calculating readiness…</p>;
  if (!readiness) return null;

  const getColorClass = (percent) => {
    if (percent >= 80) return "text-green-600";
    if (percent >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getBgClass = (percent) => {
    if (percent >= 80) return "bg-green-50 border-green-200";
    if (percent >= 60) return "bg-amber-50 border-amber-200";
    return "bg-red-50 border-red-200";
  };

  return (
    <div className={`rounded-2xl border-2 p-6 ${getBgClass(readiness.readyPercent)}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-ink-600">Exam Readiness</p>
          <p className={`text-4xl font-bold ${getColorClass(readiness.readyPercent)}`}>
            {readiness.readyPercent}%
          </p>
          <p className="mt-1 text-sm text-ink-600">{readiness.message}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-ink-900">{readiness.conceptsReady}/{readiness.conceptsTotal}</p>
          <p className="text-xs text-ink-600">Concepts mastered</p>
          {readiness.daysUntilExam !== null && (
            <>
              <p className="mt-3 text-sm font-semibold text-ink-900">{readiness.daysUntilExam}</p>
              <p className="text-xs text-ink-600">Days left</p>
            </>
          )}
        </div>
      </div>
      <div className="mt-4 h-2 w-full rounded-full bg-ink-200">
        <div
          className={`h-full rounded-full transition-all ${
            readiness.readyPercent >= 80
              ? "bg-green-500"
              : readiness.readyPercent >= 60
              ? "bg-amber-500"
              : "bg-red-500"
          }`}
          style={{ width: `${readiness.readyPercent}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-ink-600">
        Based on <span className="font-semibold">{readiness.coveragePercent}%</span> concept coverage
        ({readiness.conceptsAttempted}/{readiness.conceptsTotal} concepts attempted at least once)
      </p>
    </div>
  );
}
