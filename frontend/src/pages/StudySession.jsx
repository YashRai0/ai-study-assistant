import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import client from "../api/client.js";

const PHASE_LABELS = {
  warmup: "Warm-up",
  teach: "Learn",
  practice: "Practice",
  misconception_fix: "Fix a misconception",
  recall: "Final recall",
};

function makeEventId(seed) {
  return `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${seed}`;
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
        <p className="text-ink-500">Pick a course to start a session.</p>
        <Link to="/study" className="mt-4 inline-block rounded-full bg-ink-900 px-5 py-2 text-paper">Back to dashboard</Link>
      </main>
    );
  }

  if (loading) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-center text-ink-400">Building your session…</main>;
  }

  if (!plan?.phases?.length) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-ink-500">
          {error || "There's nothing to study yet — upload notes and wait for them to finish processing first."}
        </p>
        <Link to="/study" className="mt-4 inline-block rounded-full bg-ink-900 px-5 py-2 text-paper">Back to dashboard</Link>
      </main>
    );
  }

  if (finished) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Session complete 🎉</h1>
        <p className="mt-2 text-ink-600">You spent about {plan.totalMinutes} minutes on {plan.course.title}.</p>
        <ul className="mt-6 space-y-3">
          {[...new Map(plan.phases.map((p) => [p.conceptId, p])).values()].map((p) => {
            const after = masteryAfter[p.conceptId];
            return (
              <li key={p.conceptId} className="rounded-xl border border-ink-100 bg-white p-4">
                <p className="font-medium text-ink-900">{p.conceptName}</p>
                <p className="text-sm text-ink-500">
                  {Math.round(p.masteryBefore * 100)}%
                  {after !== undefined ? ` → ${Math.round(after * 100)}%` : ""}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="mt-8 flex gap-3">
          <Link to="/study" className="rounded-full bg-ink-900 px-5 py-2 text-paper">Back to dashboard</Link>
          <button
            onClick={() => { window.location.href = `/study-session?course=${courseId}&minutes=${minutes}`; }}
            className="rounded-full border border-ink-900 px-5 py-2 text-ink-900"
          >
            Another session
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between text-sm text-ink-400">
        <span>Step {phaseIndex + 1} of {plan.phases.length}</span>
        <span>{plan.totalMinutes}-minute session</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-highlight" style={{ width: `${((phaseIndex + 1) / plan.phases.length) * 100}%` }} />
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-400">
        {PHASE_LABELS[phase.phase] || phase.phase} · about {phase.minutes} min
      </p>
      <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">{phase.conceptName}</h1>

      {!question ? (
        <div className="mt-8">
          <p className="text-ink-400">{error || "Loading a question…"}</p>
          {error && (
            <button onClick={advance} className="mt-4 rounded-full bg-ink-900 px-5 py-2 text-paper">Skip this step</button>
          )}
        </div>
      ) : (
        <section className="mt-6 rounded-2xl border border-ink-100 bg-white p-6">
          {question.cognitiveLevel && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs capitalize text-ink-600">{question.cognitiveLevel}</span>
          )}
          <h2 className="mt-3 text-lg font-semibold text-ink-900">{question.question}</h2>
          {question.type === "mcq" ? (
            <div className="mt-5 grid gap-2">
              {question.options.map((option) => (
                <button
                  key={option}
                  onClick={() => setAnswer(option)}
                  className={`rounded-xl border p-3 text-left ${answer === option ? "border-ink-900" : "border-ink-100"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="mt-5 min-h-32 w-full rounded-xl border border-ink-100 p-3"
              placeholder="Explain your answer…"
            />
          )}
          <div className="mt-5 flex items-center gap-3">
            <label className="text-sm">Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="rounded-lg border p-2">
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </select>
          </div>
          <div className="mt-6 flex gap-3">
            <button disabled={!answer || submitting} onClick={submit} className="rounded-full bg-ink-900 px-5 py-2 text-paper disabled:opacity-40">
              {submitting ? "Recording…" : phaseIndex + 1 < plan.phases.length ? "Submit & continue" : "Submit & finish"}
            </button>
            <button onClick={() => navigate("/study")} className="text-sm text-ink-400">Exit session</button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </section>
      )}
    </main>
  );
}
