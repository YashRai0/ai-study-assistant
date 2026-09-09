import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import client from "../api/client.js";

const ACTION_COPY = {
  MISCONCEPTION_FIX: { label: "Fix a misconception", tone: "bg-red-600" },
  PREREQUISITE_GAP: { label: "Strengthen a foundation concept", tone: "bg-highlight" },
  TEACH: { label: "Learn something new", tone: "bg-ink-900" },
  REVIEW: { label: "Review before you forget", tone: "bg-highlight" },
  TEST: { label: "Test yourself", tone: "bg-sage" },
  PRACTICE: { label: "Practice", tone: "bg-ink-900" },
  DIAGNOSTIC: { label: "Find your starting point", tone: "bg-ink-900" },
};

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function ReadinessRing({ value }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(#1b2544 ${pct * 3.6}deg, #dde2ee 0deg)` }}
      role="img"
      aria-label={`Exam readiness ${pct}%`}
    >
      <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-paper">
        <span className="font-display text-3xl font-semibold text-ink-900">{pct}%</span>
        <span className="text-xs text-ink-400">ready</span>
      </div>
    </div>
  );
}

function ExamDateEditor({ course, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [examDate, setExamDate] = useState(course.examDate ? course.examDate.slice(0, 10) : "");
  const [targetScore, setTargetScore] = useState(course.targetScore ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { data } = await client.patch(`/learning/courses/${course.id}`, {
        examDate: examDate ? new Date(examDate).toISOString() : null,
        targetScore: targetScore === "" ? null : Number(targetScore),
      });
      onSaved(data.course);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const days = daysUntil(course.examDate);
    return (
      <button onClick={() => setEditing(true)} className="text-left text-sm text-ink-500 hover:text-ink-900">
        {course.examDate
          ? days >= 0
            ? `${days} day${days === 1 ? "" : "s"} until your exam`
            : "Exam date has passed — update it"
          : "No exam date set — add one"}
        <span className="ml-1 underline">edit</span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="date"
        value={examDate}
        onChange={(e) => setExamDate(e.target.value)}
        className="rounded-lg border border-ink-100 bg-white px-3 py-1.5"
      />
      <input
        type="number"
        min="0"
        max="100"
        placeholder="Target %"
        value={targetScore}
        onChange={(e) => setTargetScore(e.target.value)}
        className="w-24 rounded-lg border border-ink-100 bg-white px-3 py-1.5"
      />
      <button disabled={saving} onClick={save} className="rounded-full bg-ink-900 px-3 py-1.5 text-paper disabled:opacity-40">
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setEditing(false)} className="text-ink-400">Cancel</button>
    </div>
  );
}

const STRATEGY_LABELS = {
  misconception_confrontation: "Misconception confrontation",
  direct_instruction: "Direct instruction",
  socratic_probe: "Socratic probe",
  worked_example: "Worked example",
  test_transfer: "Test transfer",
};

export default function CourseHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState(null);
  const [courseId, setCourseId] = useState(searchParams.get("course") || "");
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState(null);
  const [strategies, setStrategies] = useState(null);

  useEffect(() => {
    client.get("/learning/courses").then(({ data }) => {
      setCourses(data.courses || []);
      const fromUrl = searchParams.get("course");
      const initial = data.courses?.find((c) => c._id === fromUrl)?._id || data.courses?.[0]?._id || "";
      setCourseId(initial);
    }).catch(() => setCourses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!courseId) { setState(null); return; }
    setLoading(true);
    client
      .get(`/learning/courses/${courseId}/adaptive-state`)
      .then(({ data }) => setState(data))
      .catch(() => setState(null))
      .finally(() => setLoading(false));
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("course", courseId);
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    if (!courseId) { setTrend(null); return; }
    client
      .get("/analytics/mastery-trend", { params: { courseId } })
      .then(({ data }) => setTrend(data.points || []))
      .catch(() => setTrend(null));
  }, [courseId]);

  useEffect(() => {
    if (!courseId) { setStrategies(null); return; }
    client
      .get("/analytics/strategy-effectiveness", { params: { courseId } })
      .then(({ data }) => setStrategies(data.strategies || []))
      .catch(() => setStrategies(null));
  }, [courseId]);

  const trendChartData = useMemo(
    () =>
      (trend || []).map((p) => ({
        label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        mastery: Math.round(p.mastery * 100),
      })),
    [trend]
  );

  const strategyChartData = useMemo(
    () =>
      (strategies || []).map((s) => ({
        label: STRATEGY_LABELS[s.strategy] || s.strategy,
        masteryGain: Math.round(s.averageMasteryDelta * 1000) / 10, // percentage points, one decimal
        attempts: s.attempts,
        confidence: s.confidence,
      })),
    [strategies]
  );

  const weakest = useMemo(
    () => (state?.concepts || []).slice().sort((a, b) => a.mastery - b.mastery),
    [state]
  );

  if (courses === null) {
    return <main className="mx-auto max-w-3xl px-6 py-12"><p className="text-ink-400">Loading…</p></main>;
  }

  if (courses.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold text-ink-900">No course yet</h1>
        <p className="mt-3 text-ink-600">
          Courses are created automatically from the subject you give a PDF when you upload it.
          Upload your first set of notes to get a mastery map and exam readiness score.
        </p>
        <Link to="/dashboard" className="mt-6 inline-block rounded-full bg-ink-900 px-5 py-2 text-paper">
          Upload notes
        </Link>
      </main>
    );
  }

  const course = state?.course;
  const action = state?.nextAction;
  const actionCopy = action ? (ACTION_COPY[action.type] || ACTION_COPY.PRACTICE) : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Your study dashboard</h1>
        <div className="flex items-center gap-3">
          <Link to={`/diagnostic?course=${courseId}`} className="text-sm font-medium text-ink-600 hover:text-ink-900">
            Take a quick diagnostic →
          </Link>
          {courses.length > 1 && (
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="rounded-full border border-ink-100 bg-white px-4 py-2 text-sm"
            >
              {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-10 text-ink-400">Loading your mastery map…</p>
      ) : !state ? (
        <p className="mt-10 text-ink-400">Couldn't load this course right now.</p>
      ) : (
        <>
          <section className="mt-8 flex flex-wrap items-center gap-6 rounded-2xl border border-ink-100 bg-white/70 p-6">
            <ReadinessRing value={state.readiness} />
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold text-ink-900">{course.title}</h2>
              <div className="mt-1">
                <ExamDateEditor course={course} onSaved={(c) => setState((s) => ({ ...s, course: { ...s.course, ...c, id: c._id || s.course.id } }))} />
              </div>
              {state.dueReviews?.length > 0 && (
                <Link to="/review" className="mt-3 inline-block rounded-full bg-highlight/20 px-3 py-1 text-xs font-medium text-ink-900">
                  {state.dueReviews.length} concept{state.dueReviews.length === 1 ? "" : "s"} due for review
                </Link>
              )}
            </div>
          </section>

          {action && (
            <section className={`mt-6 rounded-2xl border border-ink-100 p-6 text-paper ${actionCopy.tone}`}>
              <p className="text-xs font-medium uppercase tracking-wide opacity-80">Next best action</p>
              <h3 className="mt-1 font-display text-2xl font-semibold">
                {actionCopy.label}{action.concept ? `: ${action.concept.name}` : ""}
              </h3>
              <p className="mt-1 text-sm opacity-90">{action.reason} · about {action.estimatedMinutes} min</p>
              {action.type === "PREREQUISITE_GAP" && action.targetConcept && (
                <p className="mt-1 text-xs opacity-75">Unlocks progress on {action.targetConcept.name}.</p>
              )}
              {action.reasons?.length > 0 && (
                <details className="mt-3 text-xs opacity-90">
                  <summary className="cursor-pointer select-none font-medium uppercase tracking-wide opacity-80">Why this?</summary>
                  <ul className="mt-2 space-y-1">
                    {action.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2">
                        <span aria-hidden="true">✓</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <Link
                to={`/adaptive-study?course=${courseId}`}
                className="mt-4 inline-block rounded-full bg-paper px-5 py-2 text-sm font-medium text-ink-900"
              >
                Start session
              </Link>
            </section>
          )}

          <section className="mt-6 rounded-2xl border border-dashed border-ink-100 p-6">
            <p className="text-sm font-medium text-ink-900">I have a few minutes</p>
            <p className="mt-1 text-sm text-ink-500">
              We'll build a short session — warm-up, your weakest concept, practice, and a final recall check.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[10, 20, 30, 60].map((m) => (
                <Link
                  key={m}
                  to={`/study-session?course=${courseId}&minutes=${m}`}
                  className="rounded-full border border-ink-900 px-4 py-1.5 text-sm text-ink-900 hover:bg-ink-900 hover:text-paper"
                >
                  {m} min
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-6 flex items-center justify-between rounded-2xl border border-ink-100 bg-ink-900 p-6 text-paper">
            <div>
              <p className="text-sm font-medium">Ready to test yourself for real?</p>
              <p className="mt-1 text-sm opacity-80">A timed mock exam that adapts its difficulty as you go.</p>
            </div>
            <Link to={`/exam?course=${courseId}`} className="shrink-0 rounded-full bg-paper px-5 py-2 text-sm font-medium text-ink-900">
              Start mock exam
            </Link>
          </section>

          <section className="mt-10">
            <h3 className="font-display text-xl font-semibold text-ink-900">Your knowledge</h3>
            {weakest.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
                No concepts yet — once your notes finish processing, concepts and a mastery map show up here automatically.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {weakest.map((c) => (
                  <li key={c.conceptId}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ink-900">{c.name}</span>
                      <span className="flex items-center gap-2 text-ink-400">
                        {c.misconception && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">misconception</span>
                        )}
                        {c.calibrationLabel === "overconfident" && (
                          <span
                            title="You've often been sure of yourself here while getting it wrong."
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                          >
                            overconfident
                          </span>
                        )}
                        {c.calibrationLabel === "underconfident" && (
                          <span
                            title="You tend to get this right even when unsure — you may know it better than you think."
                            className="rounded-full bg-sage/20 px-2 py-0.5 text-xs text-ink-700"
                          >
                            underconfident
                          </span>
                        )}
                        {Math.round(c.mastery * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={`h-full rounded-full ${c.mastery >= 0.7 ? "bg-sage" : c.mastery >= 0.4 ? "bg-highlight" : "bg-red-500"}`}
                        style={{ width: `${Math.round(c.mastery * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {trendChartData.length > 1 && (
            <section className="mt-10">
              <h3 className="font-display text-xl font-semibold text-ink-900">Mastery over time</h3>
              <p className="text-sm text-ink-400">Average mastery across every concept touched by each attempt, in order.</p>
              <div className="mt-4 h-56 rounded-2xl border border-ink-100 bg-white/70 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b6b93" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#5b6b93" }} />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Line type="monotone" dataKey="mastery" stroke="#1b2544" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {strategyChartData.length > 0 && (
            <section className="mt-10">
              <h3 className="font-display text-xl font-semibold text-ink-900">Which teaching strategy works for you</h3>
              <p className="text-sm text-ink-400">
                Average mastery gained per tutoring turn, by strategy the adaptive tutor used.
                {strategyChartData.some((s) => s.confidence === "low") && " Lighter bars are based on very few attempts — treat those as early signal, not a verdict."}
              </p>
              <div className="mt-4 h-56 rounded-2xl border border-ink-100 bg-white/70 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={strategyChartData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f2f8" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#5b6b93" }} unit="pt" />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12, fill: "#5b6b93" }} />
                    <Tooltip formatter={(value, name, props) => [`${value}pt avg mastery gain (${props.payload.attempts} attempts)`, props.payload.label]} />
                    <Bar dataKey="masteryGain">
                      {strategyChartData.map((s, i) => (
                        <Cell key={i} fill={s.confidence === "low" ? "#c7cee0" : "#1b2544"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
