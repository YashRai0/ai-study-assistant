import { useEffect, useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";
import client from "../api/client.js";

function formatShortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getActivityLevel(count) {
  if (!count || count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  return 3;
}

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoveredDay, setHoveredDay] = useState(null);

  useEffect(() => {
    client
      .get("/analytics/summary")
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(err.response?.data?.error || "Couldn't load analytics right now."))
      .finally(() => setLoading(false));
  }, []);

  const activityStats = useMemo(() => {
    if (!summary?.activityByDay) return { activeDays: 0, totalActions: 0 };
    let activeDays = 0;
    let totalActions = 0;
    for (const d of summary.activityByDay) {
      if (d.count > 0) activeDays++;
      totalActions += d.count;
    }
    return { activeDays, totalActions };
  }, [summary]);

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-ink-400">Loading learning analytics…</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 text-center">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      </main>
    );
  }

  const activityChartData = (summary.activityByDay || []).map((d) => ({
    label: formatShortDate(d.date),
    count: d.count,
  }));

  const subjectChartData = (summary.quiz?.bySubject || [])
    .filter((s) => s.averageScorePercent !== null)
    .map((s) => ({ subject: s.subject, score: s.averageScorePercent }));

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-6">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
            Cognitive Diagnostics
          </span>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Learning Analytics
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Study habits, retention trends, and assessment mastery metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/review"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper shadow-xs hover:bg-ink-800 transition"
          >
            <span>🔄 Spaced Review</span>
          </Link>
          <Link
            to="/dashboard"
            className="rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-1">
          <span className="text-xl">📄</span>
          <p className="text-xs font-medium text-ink-400">Notes Uploaded</p>
          <p className="font-display text-3xl font-extrabold text-ink-900">{summary.totalPdfs}</p>
          <p className="text-[11px] text-ink-400">Total knowledge sources</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-1">
          <span className="text-xl">💬</span>
          <p className="text-xs font-medium text-ink-400">Questions Synthesized</p>
          <p className="font-display text-3xl font-extrabold text-ink-900">{summary.totalQuestionsAsked}</p>
          <p className="text-[11px] text-ink-400">Across chat & multi-doc RAG</p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-1">
          <span className="text-xl">🎯</span>
          <p className="text-xs font-medium text-ink-400">Quiz Average</p>
          <p className="font-display text-3xl font-extrabold text-ink-900">
            {summary.quiz?.averageScorePercent !== null ? `${summary.quiz.averageScorePercent}%` : "—"}
          </p>
          <p className="text-[11px] text-ink-400">
            {summary.quiz?.attempts || 0} attempt{summary.quiz?.attempts === 1 ? "" : "s"} recorded
          </p>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs space-y-1">
          <span className="text-xl">🔥</span>
          <p className="text-xs font-medium text-ink-400">Study Streak</p>
          <p className="font-display text-3xl font-extrabold text-indigo-600">
            {summary.studyStreakDays} <span className="text-base font-bold text-ink-700">Days</span>
          </p>
          <p className="text-[11px] text-ink-400">Consistent daily study</p>
        </div>
      </div>

      {/* 30-Day Activity Heatmap Matrix */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">30-Day Activity Matrix</h2>
            <p className="text-xs text-ink-500">
              {activityStats.activeDays} active days · {activityStats.totalActions} total learning actions
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-ink-500">
            <span>Less</span>
            <span className="h-3 w-3 rounded-xs bg-ink-100" />
            <span className="h-3 w-3 rounded-xs bg-emerald-200" />
            <span className="h-3 w-3 rounded-xs bg-emerald-400" />
            <span className="h-3 w-3 rounded-xs bg-emerald-600" />
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Dots Grid */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {(summary.activityByDay || []).map((d) => {
            const level = getActivityLevel(d.count);
            let bgClass = "bg-ink-100";
            if (level === 1) bgClass = "bg-emerald-200";
            if (level === 2) bgClass = "bg-emerald-400";
            if (level === 3) bgClass = "bg-emerald-600";

            return (
              <div
                key={d.date}
                onMouseEnter={() => setHoveredDay(d)}
                onMouseLeave={() => setHoveredDay(null)}
                className={`h-5 w-5 sm:h-6 sm:w-6 rounded-md transition-all cursor-pointer hover:scale-110 ${bgClass}`}
                title={`${formatShortDate(d.date)}: ${d.count} action${d.count === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>

        {hoveredDay && (
          <p className="text-xs text-indigo-700 font-semibold animate-in fade-in">
            {formatShortDate(hoveredDay.date)}: {hoveredDay.count} learning action{hoveredDay.count === 1 ? "" : "s"}
          </p>
        )}
      </section>

      {/* Dual Charts: Activity Velocity & Subject Mastery */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Velocity Bar Chart */}
        <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">Activity Velocity</h2>
            <p className="text-xs text-ink-500">Questions, notes analyzed, and quizzes over 30 days.</p>
          </div>

          <div className="h-60 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activityChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" interval={4} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "none", color: "#ffffff", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Subject Mastery Comparison Chart */}
        <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">Subject Mastery Distribution</h2>
            <p className="text-xs text-ink-500">Average quiz score across subjects.</p>
          </div>

          <div className="h-60 w-full pt-2">
            {subjectChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectChartData} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} unit="%" />
                  <YAxis type="category" dataKey="subject" width={110} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <Tooltip
                    formatter={(value) => `${value}%`}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "none", color: "#ffffff", fontSize: "12px" }}
                  />
                  <Bar dataKey="score" fill="#10b981" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-400">
                Take quizzes across your documents to see subject comparisons here.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent Quiz Attempts Log */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="font-display text-lg font-bold text-ink-900">Recent Assessment Log</h2>
        {!summary.quiz?.recent?.length ? (
          <p className="rounded-xl border border-dashed border-ink-200 p-8 text-center text-xs text-ink-400">
            No quiz attempts yet — generate a quiz on any uploaded note to see your assessment history.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {summary.quiz.recent.map((a, i) => {
              const scorePct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
              const isHigh = scorePct >= 80;
              const isMed = scorePct >= 50;

              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-ink-100 bg-white p-3.5 shadow-2xs hover:border-ink-200 transition"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-ink-900 text-sm">{a.filename}</p>
                    <p className="text-[11px] text-ink-400">
                      {a.subject} · {new Date(a.takenAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        isHigh
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : isMed
                          ? "bg-amber-50 text-amber-800 border border-amber-200"
                          : "bg-rose-50 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {a.score}/{a.total} ({scorePct}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
