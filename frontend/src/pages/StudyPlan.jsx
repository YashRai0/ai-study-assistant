import { useEffect, useState } from "react";
import client from "../api/client.js";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import { calculatePlanProgress } from "../utils/planHelpers.js";

const ALL_SCOPE = "All subjects";

function PlanView({ plan, onToggleDay, onDelete }) {
  const completedCount = plan.days.filter((d) => d.completed).length;
  const totalCount = plan.days.length;
  const progressPercent = calculatePlanProgress(plan.days);

  return (
    <Card className="p-6 sm:p-8">
      {/* Plan Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-ink-100 dark:border-[#273352] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo" size="sm" dot>
              Adaptive Schedule
            </Badge>
            {plan.scope && <Badge variant="outline" size="sm">{plan.scope}</Badge>}
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold text-ink-900 dark:text-ink-50">
            {plan.planTitle}
          </h2>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            {plan.examDate ? `Target Exam: ${plan.examDate}` : `${totalCount}-Day Milestone Schedule`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(plan._id)}
          >
            Delete Plan
          </Button>
        </div>
      </div>

      {/* Progress Bar Ribbon */}
      <div className="mt-6 rounded-2xl bg-ink-50/70 dark:bg-[#131a2c] p-4 border border-ink-100 dark:border-[#273352]">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-ink-600 dark:text-ink-300">
            {completedCount} of {totalCount} milestones completed
          </span>
          <span className="font-mono text-highlight dark:text-amber-400">
            {progressPercent}%
          </span>
        </div>
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-ink-200/80 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-highlight to-amber-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Daily Milestones */}
      <div className="mt-6 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
          Daily Learning Modules
        </h3>
        <ul className="space-y-3">
          {plan.days.map((d, i) => (
            <li
              key={i}
              className={`flex items-start gap-4 rounded-xl border p-4 transition ${
                d.completed
                  ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20 opacity-80"
                  : "border-ink-100 dark:border-[#273352] bg-white dark:bg-[#1b233a] hover:border-ink-300 dark:hover:border-ink-700"
              }`}
            >
              <input
                type="checkbox"
                checked={d.completed}
                onChange={(e) => onToggleDay(i, e.target.checked)}
                className="mt-1 h-5 w-5 rounded border-ink-300 text-highlight focus:ring-highlight dark:border-ink-700 dark:bg-[#131a2c] cursor-pointer"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink-900 dark:text-ink-100">
                    Day {d.day}
                    {d.date && ` · ${d.date}`} — {d.subject}
                  </span>
                  <div className="flex items-center gap-2">
                    {d.estimatedMinutes && (
                      <span className="rounded-md bg-ink-100 dark:bg-[#1f2842] px-2 py-0.5 text-2xs font-medium text-ink-600 dark:text-ink-300">
                        ⏱ ~{d.estimatedMinutes} min
                      </span>
                    )}
                    {d.completed && (
                      <Badge variant="sage" size="sm">Done ✓</Badge>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">{d.focus}</p>
                {d.topics?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {d.topics.map((t, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-ink-50 dark:bg-[#131a2c] px-2.5 py-1 text-2xs font-medium text-ink-500 dark:text-ink-400 border border-ink-100 dark:border-[#273352]"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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
    client.get("/search/subjects").then(({ data }) => setSubjects(data.subjects || [])).catch(() => setSubjects([]));
    loadPlans();
  }, []);

  function loadPlans() {
    setLoadingPlans(true);
    client
      .get("/study-plan")
      .then(({ data }) => {
        setPlans(data.plans || []);
        if (data.plans?.length > 0 && !activePlan) {
          openPlan(data.plans[0].id || data.plans[0]._id);
        }
      })
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
    if (!id) return;
    try {
      const { data } = await client.get(`/study-plan/${id}`);
      setActivePlan(data.plan);
    } catch {
      // fallback
    }
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
      // best-effort
    }
  }

  async function deletePlan(id) {
    if (!window.confirm("Delete this study plan?")) return;
    try {
      await client.delete(`/study-plan/${id}`);
      if (activePlan?._id === id || activePlan?.id === id) setActivePlan(null);
      loadPlans();
    } catch {
      // handle error
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-ink-100 dark:border-[#273352] pb-6">
        <div className="flex items-center gap-2">
          <Badge variant="highlight" size="sm" dot>
            Adaptive Roadmap
          </Badge>
          <span className="text-xs text-ink-400">Paced Knowledge Acquisition</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-ink-50 sm:text-4xl">
          Personalized Study Plan
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Synthesize your notes into a paced, day-by-day roadmap tailored to your target exam date or daily availability.
        </p>
      </div>

      {/* Plan Builder Form */}
      <Card className="mt-8 p-6 sm:p-8">
        <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-100">
          Create New Pacing Schedule
        </h2>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
          Select target subjects and deadlines to dynamically distribute learning loads.
        </p>

        <div className="mt-6 space-y-5">
          {/* Subject Scope */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">
              Subject Scope
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSubject(ALL_SCOPE)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  subject === ALL_SCOPE
                    ? "bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950 shadow-sm"
                    : "border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] text-ink-700 dark:text-ink-300 hover:bg-ink-50"
                }`}
              >
                All subjects
              </button>
              {subjects.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSubject(s)}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    subject === s
                      ? "bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950 shadow-sm"
                      : "border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] text-ink-700 dark:text-ink-300 hover:bg-ink-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Time & Deadline Parameters */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
                Target Exam Date
              </label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
              />
            </div>

            {!examDate && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
                Target Min / Day
              </label>
              <input
                type="number"
                min={10}
                max={480}
                placeholder="e.g. 60"
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(e.target.value)}
                className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
              />
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="primary"
              size="md"
              loading={generating}
              onClick={generate}
            >
              Generate Adaptive Plan
            </Button>
          </div>

          {error && (
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </Card>

      {/* Active Plan Detail View */}
      {activePlan && (
        <div className="mt-8">
          <PlanView plan={activePlan} onToggleDay={toggleDay} onDelete={deletePlan} />
        </div>
      )}

      {/* Saved Plans Section */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold text-ink-900 dark:text-ink-50">
          Your Saved Study Plans
        </h2>

        {loadingPlans ? (
          <div className="mt-4 space-y-3">
            <div className="h-16 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
            <div className="h-16 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          </div>
        ) : plans.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon="🗓️"
            title="No study plans created yet"
            description="Generate your first schedule above to break your study materials into achievable daily goals."
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {plans.map((p) => {
              const planId = p.id || p._id;
              const isSelected = activePlan?._id === planId || activePlan?.id === planId;
              const completedPercent = p.totalDays > 0 ? Math.round((p.completedDays / p.totalDays) * 100) : 0;
              return (
                <li
                  key={planId}
                  onClick={() => openPlan(planId)}
                  className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-highlight bg-highlight/10 dark:border-highlight/50 shadow-sm"
                      : "border-ink-100 dark:border-[#273352] bg-white dark:bg-[#1b233a] hover:border-ink-300 dark:hover:border-ink-700"
                  }`}
                >
                  <div>
                    <h3 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">
                      {p.planTitle}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {p.scope}
                      {p.examDate && ` · Exam: ${p.examDate}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="hidden sm:block text-right">
                      <span className="text-xs font-semibold text-ink-700 dark:text-ink-300">
                        {p.completedDays} / {p.totalDays} Days
                      </span>
                      <div className="mt-1 h-1.5 w-24 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                        <div
                          className="h-full bg-highlight rounded-full"
                          style={{ width: `${completedPercent}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-highlight">
                      {isSelected ? "Active View" : "Open →"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
