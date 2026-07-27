import { useEffect, useState } from "react";
import client from "../api/client.js";

const ALL_SCOPE = "All subjects";

function PlanView({ plan, onToggleDay, onDelete }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white/70 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-xl font-semibold text-ink-900">{plan.planTitle}</h3>
          <p className="text-sm text-ink-400">
            {plan.scope}
            {plan.examDate && ` · Exam: ${plan.examDate}`}
          </p>
        </div>
        <button onClick={() => onDelete(plan._id)} className="text-sm text-red-600 hover:underline">
          Delete
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {plan.days.map((d, i) => (
          <li key={i} className="flex items-start gap-3 rounded-xl border border-ink-100 px-4 py-3">
            <input
              type="checkbox"
              checked={d.completed}
              onChange={(e) => onToggleDay(i, e.target.checked)}
              className="mt-1"
            />
            <div className={d.completed ? "opacity-50" : ""}>
              <p className="font-medium text-ink-900">
                Day {d.day}
                {d.date && ` · ${d.date}`} — {d.subject}
              </p>
              <p className="text-sm text-ink-600">{d.focus}</p>
              <p className="mt-1 text-sm text-ink-400">{d.topics.join(", ")}</p>
              <p className="mt-1 text-xs text-ink-400">~{d.estimatedMinutes} min</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function StudyPlan() {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState(ALL_SCOPE);
  const [examDate, setExamDate] = useState("");
  const [days, setDays] = useState(7);
  const [minutesPerDay, setMinutesPerDay] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const [plans, setPlans] = useState([]);
  const [activePlan, setActivePlan] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    client.get("/search/subjects").then(({ data }) => setSubjects(data.subjects)).catch(() => setSubjects([]));
    loadPlans();
  }, []);

  function loadPlans() {
    setLoadingPlans(true);
    client
      .get("/study-plan")
      .then(({ data }) => setPlans(data.plans))
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const body = { subject: subject === ALL_SCOPE ? undefined : subject };
      if (examDate) body.examDate = examDate;
      else body.days = Number(days) || 7;
      if (minutesPerDay) body.minutesPerDay = Number(minutesPerDay);

      const { data } = await client.post("/study-plan", body);
      setActivePlan(data.plan);
      loadPlans();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't generate a study plan. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function openPlan(id) {
    const { data } = await client.get(`/study-plan/${id}`);
    setActivePlan(data.plan);
  }

  async function toggleDay(dayIndex, completed) {
    if (!activePlan) return;
    setActivePlan((prev) => {
      const updated = { ...prev, days: [...prev.days] };
      updated.days[dayIndex] = { ...updated.days[dayIndex], completed };
      return updated;
    });
    try {
      await client.patch(`/study-plan/${activePlan._id}/days/${dayIndex}`, { completed });
      loadPlans();
    } catch {
      // best-effort — the checkbox already reflects the intended state locally
    }
  }

  async function deletePlan(id) {
    if (!window.confirm("Delete this study plan?")) return;
    await client.delete(`/study-plan/${id}`);
    if (activePlan?._id === id) setActivePlan(null);
    loadPlans();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Study plan</h1>
      <p className="mt-2 text-ink-600">
        Generate a day-by-day plan from your notes — give it an exam date, or just a number of days.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-ink-100 bg-white/70 p-6">
        <div>
          <label className="text-sm text-ink-400">Subject</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              onClick={() => setSubject(ALL_SCOPE)}
              className={`rounded-full px-4 py-2 text-sm ${
                subject === ALL_SCOPE ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
              }`}
            >
              All subjects
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`rounded-full px-4 py-2 text-sm ${
                  subject === s ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <div>
            <label className="text-sm text-ink-400">Exam date (optional)</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="mt-1 block rounded-full border border-ink-100 px-4 py-2 text-sm"
            />
          </div>
          {!examDate && (
            <div>
              <label className="text-sm text-ink-400">Days to plan</label>
              <input
                type="number"
                min={1}
                max={60}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1 block w-24 rounded-full border border-ink-100 px-4 py-2 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-sm text-ink-400">Minutes/day (optional)</label>
            <input
              type="number"
              min={10}
              max={480}
              placeholder="e.g. 60"
              value={minutesPerDay}
              onChange={(e) => setMinutesPerDay(e.target.value)}
              className="mt-1 block w-28 rounded-full border border-ink-100 px-4 py-2 text-sm"
            />
          </div>
        </div>

        <button
          onClick={generate}
          disabled={generating}
          className="rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 disabled:opacity-50"
        >
          {generating ? "Generating…" : "Generate study plan"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {activePlan && (
        <div className="mt-8">
          <PlanView plan={activePlan} onToggleDay={toggleDay} onDelete={deletePlan} />
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink-900">Your saved plans</h2>
        {loadingPlans ? (
          <p className="mt-4 text-ink-400">Loading…</p>
        ) : plans.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
            No study plans yet — generate one above.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {plans.map((p) => (
              <li
                key={p.id}
                className="flex cursor-pointer items-center justify-between rounded-xl border border-ink-100 bg-white/70 px-4 py-3 hover:border-highlight"
                onClick={() => openPlan(p.id)}
              >
                <div>
                  <p className="font-medium text-ink-900">{p.planTitle}</p>
                  <p className="text-xs text-ink-400">
                    {p.scope}
                    {p.examDate && ` · Exam: ${p.examDate}`}
                  </p>
                </div>
                <p className="text-sm text-ink-400">
                  {p.completedDays}/{p.totalDays} days done
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
