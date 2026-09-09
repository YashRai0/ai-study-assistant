import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import client from "../api/client.js";

export default function DiagnosticTest() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get("course") || "");
  const [sessionId, setSessionId] = useState(null);
  const [progressCount, setProgressCount] = useState(0);
  const [current, setCurrent] = useState(null); // { question, conceptId, conceptName, reason } | null
  const [done, setDone] = useState(false);
  const [doneReason, setDoneReason] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState("");

  async function loadCourses() {
    const { data } = await client.get("/learning/courses");
    setCourses(data.courses || []);
    const fromUrl = searchParams.get("course");
    const preferred = data.courses?.find((c) => c._id === fromUrl)?._id;
    if (!courseId) setCourseId(preferred || data.courses?.[0]?._id || "");
  }

  // Creates a new diagnostic session, or resumes the one already in
  // progress for this course (the backend enforces at most one active
  // session per user+course, so a page reload picks up where it left off
  // instead of silently starting over).
  async function start() {
    if (!courseId) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post(`/learning/courses/${courseId}/diagnostic/start`);
      setSessionId(data.sessionId);
      setProgressCount(data.answeredCount || 0);
      applyResult(data);
    } catch {
      setError("Couldn't start the diagnostic. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadNext(sid) {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post(`/learning/courses/${courseId}/diagnostic/next`, { sessionId: sid });
      applyResult(data);
    } catch {
      setError("Couldn't load the next diagnostic question. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyResult(data) {
    if (data.done) {
      setDone(true);
      setDoneReason(data.reason || null);
      setCurrent(null);
    } else {
      setDone(false);
      setCurrent(data);
      setAnswer("");
      setLastResult(null);
    }
  }

  useEffect(() => { loadCourses().catch(() => setCourses([])); }, []);
  useEffect(() => {
    if (courseId) { setProgressCount(0); setDone(false); start(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function submit() {
    if (!current?.question || !sessionId || submitting) return;
    setSubmitting(true);
    setError("");
    const eventId = `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${current.question._id}`;
    try {
      const { data } = await client.post(
        "/learning/attempts/durable",
        {
          eventId, courseId, questionId: current.question._id, answer, confidence,
          difficulty: current.question.difficulty, diagnosticSessionId: sessionId,
        },
        { headers: { "Idempotency-Key": eventId } }
      );
      setLastResult(data.evaluation || null);
      setProgressCount((n) => n + 1);
      // Brief pause so the correct/incorrect result is visible before the
      // next question replaces it — matches the pattern of showing
      // lastResult in AdaptiveStudy.jsx, just on a short timer here since
      // a diagnostic is meant to move quickly through several questions.
      setTimeout(() => loadNext(sessionId), 900);
    } catch {
      setError("Couldn't record that answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Diagnostic</h1>
      <p className="mt-2 text-ink-600">
        A short adaptive check-in — which question comes next depends on how you answer, so we can find your
        starting point quickly instead of guessing.
      </p>

      <select
        className="mt-6 w-full rounded-xl border border-ink-100 bg-white p-3"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        <option value="">Choose a course</option>
        {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
      </select>

      {courseId && <p className="mt-4 text-sm text-ink-400">{progressCount} question{progressCount === 1 ? "" : "s"} answered so far</p>}

      {loading ? (
        <p className="mt-8 text-ink-400">Thinking…</p>
      ) : done && doneReason === "empty_bank" ? (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h2 className="font-display text-xl font-semibold text-ink-900">No questions available yet</h2>
          <p className="mt-2 text-ink-600">
            This course doesn't have any diagnostic questions yet — upload a document for it first so concepts and
            questions can be generated, then come back to run the diagnostic.
          </p>
        </section>
      ) : done ? (
        <section className="mt-8 rounded-2xl border border-ink-100 bg-white p-6 text-center">
          <h2 className="font-display text-xl font-semibold text-ink-900">Diagnostic complete</h2>
          <p className="mt-2 text-ink-600">
            You answered {progressCount} question{progressCount === 1 ? "" : "s"}. Your starting point for each
            concept has been recorded — check your course home for what to study first.
          </p>
          <button
            onClick={() => navigate(`/study?course=${courseId}`)}
            className="mt-6 rounded-full bg-ink-900 px-5 py-2 text-paper"
          >
            Go to course home
          </button>
        </section>
      ) : current?.question ? (
        <section className="mt-8 rounded-2xl border border-ink-100 bg-white p-6">
          <div className="flex flex-wrap gap-2 text-xs text-ink-500">
            {current.conceptName && <span>{current.conceptName}</span>}
            {current.question.cognitiveLevel && (
              <>
                <span>·</span>
                <span className="capitalize">{current.question.cognitiveLevel}</span>
              </>
            )}
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink-900">{current.question.question}</h2>
          {current.question.type === "mcq" ? (
            <div className="mt-5 grid gap-2">
              {current.question.options.map((option) => (
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

          {lastResult && (
            <section className={`mt-6 rounded-2xl border p-5 ${lastResult.correct ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="font-semibold text-ink-900">{lastResult.correct ? "✓ Correct" : "Not quite"}</p>
            </section>
          )}

          <button
            disabled={!answer || submitting}
            onClick={submit}
            className="mt-6 rounded-full bg-ink-900 px-5 py-2 text-paper disabled:opacity-40"
          >
            {submitting ? "Recording…" : "Submit answer"}
          </button>
        </section>
      ) : (
        <p className="mt-8 text-ink-500">
          {error || "No diagnostic questions are available yet for this course."}
        </p>
      )}

      {error && current?.question && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}