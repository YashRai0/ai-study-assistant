import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import client from "../api/client.js";

const PHASE_LABELS = {
  warmup: "Warm-up",
  teach: "Core Concept",
  practice: "Active Practice",
  misconception_fix: "Repair Misconception",
  recall: "Spaced Recall",
};

const CONFIDENCE_LEVELS = [
  { val: 1, label: "Guessing" },
  { val: 2, label: "Unsure" },
  { val: 3, label: "Moderate" },
  { val: 4, label: "Confident" },
  { val: 5, label: "Mastered" },
];

function makeEventId(seed) {
  return `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${seed}`;
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StudySession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const courseId = searchParams.get("course") || "";
  const minutes = Number(searchParams.get("minutes")) || 20;

  const [plan, setPlan] = useState(null);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const [masteryAfter, setMasteryAfter] = useState({});

  // Pomodoro Timer States
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!courseId) return;
    client
      .get(`/learning/courses/${courseId}/study-session/plan`, { params: { minutes } })
      .then(({ data }) => setPlan(data.plan))
      .catch(() => setError("Couldn't build a session plan for this course."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const phase = plan?.phases?.[phaseIndex] || null;
  const phaseTotalSeconds = (phase?.minutes || 5) * 60;

  // Initialize timer when phase changes
  useEffect(() => {
    if (phase) {
      setSecondsLeft((phase.minutes || 5) * 60);
      setIsPaused(false);
    }
  }, [phaseIndex, phase?.conceptId]);

  // Timer Tick
  useEffect(() => {
    if (isPaused || secondsLeft <= 0 || finished) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [isPaused, secondsLeft, finished]);

  useEffect(() => {
    if (!phase) return;
    setQuestion(null);
    setAnswer("");
    setError("");
    client
      .get(`/learning/courses/${courseId}/concepts/${phase.conceptId}/question`)
      .then(({ data }) => setQuestion(data.question))
      .catch(() => setError("Couldn't load a question for this step — skipping ahead."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.conceptId, phaseIndex]);

  function advance() {
    if (phaseIndex + 1 < (plan?.phases?.length || 0)) {
      setPhaseIndex((i) => i + 1);
    } else {
      finishSession();
    }
  }

  async function finishSession() {
    setFinished(true);
    try {
      const { data } = await client.get(`/learning/courses/${courseId}/adaptive-state`);
      const byId = {};
      for (const c of data.concepts || []) byId[c.conceptId] = c.mastery;
      setMasteryAfter(byId);
    } catch {
      // Non-critical — the summary just won't show "after" numbers.
    }
  }

  async function submit() {
    if (!question || submitting) return;
    setSubmitting(true);
    const eventId = makeEventId(question._id);
    try {
      await client.post(
        "/learning/attempts/durable",
        { eventId, courseId, questionId: question._id, answer, confidence, difficulty: question.difficulty },
        { headers: { "Idempotency-Key": eventId } }
      );
      advance();
    } catch {
      setError("Couldn't record that answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!courseId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-ink-500">Pick a course to start a focused study session.</p>
        <Link to="/study" className="mt-4 inline-block rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold text-paper">
          Back to Courses
        </Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <p className="mt-3 text-sm text-ink-400">Synthesizing personalized session phases…</p>
      </main>
    );
  }

  if (!plan?.phases?.length) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-ink-500">
          {error || "There's nothing to study yet — upload notes and wait for them to finish processing first."}
        </p>
        <Link to="/study" className="mt-4 inline-block rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold text-paper">
          Back to Courses
        </Link>
      </main>
    );
  }

  // Completion Screen
  if (finished) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/40 via-white to-white p-8 text-center shadow-md">
          <span className="text-5xl">🎉</span>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink-900">
            Session Completed!
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            You completed a <strong className="text-ink-900">{plan.totalMinutes}-minute</strong> focused study block on{" "}
            <strong className="text-indigo-700">{plan.course.title}</strong>.
          </p>

          <div className="mt-8 space-y-3 text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block px-1">
              Mastery Growth Summary
            </span>
            {[...new Map(plan.phases.map((p) => [p.conceptId, p])).values()].map((p) => {
              const beforePct = Math.round(p.masteryBefore * 100);
              const after = masteryAfter[p.conceptId];
              const afterPct = after !== undefined ? Math.round(after * 100) : beforePct;
              const delta = afterPct - beforePct;

              return (
                <div
                  key={p.conceptId}
                  className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white p-4 shadow-2xs"
                >
                  <div>
                    <p className="font-semibold text-ink-900 text-sm">{p.conceptName}</p>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {beforePct}% {after !== undefined ? `→ ${afterPct}%` : ""}
                    </p>
                  </div>
                  {delta > 0 ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                      +{delta}% Mastery
                    </span>
                  ) : (
                    <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
                      Reinforced
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="rounded-full bg-ink-900 px-6 py-2.5 text-xs font-semibold text-paper shadow-xs hover:bg-ink-800 transition"
            >
              Return to Dashboard
            </Link>
            <button
              onClick={() => {
                window.location.href = `/study-session?course=${courseId}&minutes=${minutes}`;
              }}
              className="rounded-full border border-ink-200 bg-white px-6 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
            >
              Start Another Session ↻
            </button>
          </div>
        </div>
      </main>
    );
  }

  const timePct = phaseTotalSeconds > 0 ? Math.round((secondsLeft / phaseTotalSeconds) * 100) : 0;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 space-y-6">
      {/* Top Pomodoro HUD Header */}
      <div className="rounded-2xl border border-ink-100 bg-white/90 p-4 shadow-sm backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
              Focus Pomodoro HUD
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-bold text-ink-900">
                Phase {phaseIndex + 1} of {plan.phases.length}:
              </span>
              <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                {PHASE_LABELS[phase.phase] || phase.phase}
              </span>
            </div>
          </div>

          {/* Circular Countdown Timer */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-11 w-11 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-ink-100"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-indigo-600 transition-all duration-1000 ease-linear"
                    strokeDasharray={`${timePct}, 100`}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <span className="absolute font-mono text-[10px] font-bold text-ink-900">
                  {formatTimer(secondsLeft)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-200 bg-ink-50/70 text-xs text-ink-700 hover:bg-ink-100 transition shadow-2xs"
                title={isPaused ? "Resume timer" : "Pause timer"}
              >
                {isPaused ? "▶" : "⏸"}
              </button>
            </div>
          </div>
        </div>

        {/* Phase Pipeline Pills */}
        <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-ink-100/70 text-xs">
          {plan.phases.map((p, idx) => {
            const isCurrent = idx === phaseIndex;
            const isCompleted = idx < phaseIndex;

            let pillClass = "border border-ink-200 bg-white text-ink-400";
            if (isCurrent) {
              pillClass = "border-indigo-600 bg-indigo-50 font-bold text-indigo-900 shadow-2xs";
            } else if (isCompleted) {
              pillClass = "border-emerald-200 bg-emerald-50 font-medium text-emerald-800";
            }

            return (
              <div
                key={idx}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11px] transition ${pillClass}`}
              >
                <span>{isCompleted ? "✓" : `${idx + 1}.`}</span>
                <span>{PHASE_LABELS[p.phase] || p.phase}</span>
                <span className="opacity-60">({p.minutes}m)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Study Card */}
      <div className="space-y-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Target Concept</span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">{phase.conceptName}</h1>
        </div>

        {!question ? (
          <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center space-y-3">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="text-xs text-ink-400">{error || "Calibrating pedagogical question…"}</p>
            {error && (
              <button
                onClick={advance}
                className="mt-3 rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold text-paper"
              >
                Skip this step →
              </button>
            )}
          </div>
        ) : (
          <section className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2">
              {question.cognitiveLevel && (
                <span className="rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-indigo-700">
                  {question.cognitiveLevel}
                </span>
              )}
              {question.difficulty && (
                <span className="text-[11px] font-medium text-ink-400">
                  Difficulty Level: {question.difficulty}/5
                </span>
              )}
            </div>

            <h2 className="text-base font-bold text-ink-900 leading-relaxed">{question.question}</h2>

            {/* Response Area */}
            {question.type === "mcq" ? (
              <div className="grid gap-2.5 pt-1">
                {question.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(option)}
                    className={`flex items-center justify-between rounded-xl border p-3.5 text-left text-xs transition-all ${
                      answer === option
                        ? "border-indigo-600 bg-indigo-50/70 font-semibold text-indigo-950 ring-2 ring-indigo-500/20"
                        : "border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50/50"
                    }`}
                  >
                    <span>{option}</span>
                    {answer === option && <span className="text-indigo-600 font-bold">●</span>}
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-ink-200 p-3.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-indigo-600 focus:outline-hidden"
                placeholder="Explain your reasoning or conceptual step-by-step answer…"
              />
            )}

            {/* Metacognitive Confidence Selector */}
            <div className="space-y-1.5 pt-2 border-t border-ink-100/70">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                Self-Reported Confidence
              </span>
              <div className="grid grid-cols-5 gap-1.5">
                {CONFIDENCE_LEVELS.map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setConfidence(val)}
                    className={`rounded-xl border py-2 px-1 text-center transition ${
                      confidence === val
                        ? "border-indigo-600 bg-indigo-50 font-bold text-indigo-950 ring-2 ring-indigo-500/20"
                        : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    <span className="text-xs font-bold block">{val}</span>
                    <span className="text-[9px] truncate block opacity-70">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-3 border-t border-ink-100">
              <button
                type="button"
                onClick={() => navigate("/study")}
                className="text-xs text-ink-400 hover:text-ink-700 transition"
              >
                Exit session
              </button>

              <button
                disabled={!answer || submitting}
                onClick={submit}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-6 py-2.5 text-xs font-bold text-paper shadow-xs hover:bg-ink-800 transition disabled:opacity-40"
              >
                <span>{submitting ? "Submitting…" : phaseIndex + 1 < plan.phases.length ? "Submit & Continue →" : "Finish Session 🎉"}</span>
              </button>
            </div>

            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
