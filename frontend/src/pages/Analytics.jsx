import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import client from "../api/client.js";

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white/70 p-5">
      <p className="text-sm text-ink-400">{label}</p>
      <p className="mt-1 font-display text-3xl font-semibold text-ink-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-ink-400">{sub}</p>}
    </div>
  );
}

function formatShortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .get("/analytics/summary")
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(err.response?.data?.error || "Couldn't load analytics right now."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-ink-400">Loading your analytics…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  const activityChartData = summary.activityByDay.map((d) => ({
    label: formatShortDate(d.date),
    count: d.count,
  }));

  const subjectChartData = summary.quiz.bySubject
    .filter((s) => s.averageScorePercent !== null)
    .map((s) => ({ subject: s.subject, score: s.averageScorePercent }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Your study analytics</h1>
      <p className="mt-2 text-ink-600">A look at what you've studied and how you're doing on quizzes.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Notes uploaded" value={summary.totalPdfs} />
        <StatCard label="Questions asked" value={summary.totalQuestionsAsked} sub="across chat + multi-doc chat" />
        <StatCard
          label="Quiz average"
          value={summary.quiz.averageScorePercent !== null ? `${summary.quiz.averageScorePercent}%` : "—"}
          sub={`${summary.quiz.attempts} attempt${summary.quiz.attempts === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Study streak"
          value={`${summary.studyStreakDays} day${summary.studyStreakDays === 1 ? "" : "s"}`}
          sub="consecutive active days"
        />
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink-900">Activity, last 30 days</h2>
        <p className="text-sm text-ink-400">Chat questions, multi-doc questions, and quiz attempts combined.</p>
        <div className="mt-4 h-64 rounded-2xl border border-ink-100 bg-white/70 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
              <XAxis dataKey="label" interval={4} tick={{ fontSize: 12, fill: "#5b6b93" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#5b6b93" }} />
              <Tooltip />
              <Bar dataKey="count" fill="#1b2544" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {subjectChartData.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-ink-900">Quiz average by subject</h2>
          <div className="mt-4 h-64 rounded-2xl border border-ink-100 bg-white/70 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectChartData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#5b6b93" }} />
                <YAxis type="category" dataKey="subject" width={120} tick={{ fontSize: 12, fill: "#5b6b93" }} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="score" fill="#f5b942" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink-900">Recent quiz attempts</h2>
        {summary.quiz.recent.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
            No quiz attempts yet — take a quiz on one of your PDFs to see it here.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {summary.quiz.recent.map((a, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl border border-ink-100 bg-white/70 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink-900">{a.filename}</p>
                  <p className="text-xs text-ink-400">
                    {a.subject} · {new Date(a.takenAt).toLocaleDateString()}
                  </p>
                </div>
                <p className="font-display text-lg font-semibold text-ink-900">
                  {a.score}/{a.total}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
