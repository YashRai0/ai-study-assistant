import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import client from "../api/client.js";
import TutorResponse from "../components/TutorResponse.jsx";
import TutorIntervention from "../components/TutorIntervention.jsx";
import FocusMode from "../components/FocusMode.jsx";

export default function AdaptiveStudy() {
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get("course") || "");
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const [showTutor, setShowTutor] = useState(false);
  const [showAdaptiveTutor, setShowAdaptiveTutor] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusActive, setFocusActive] = useState(false);

  async function loadCourses() {
    const { data } = await client.get("/learning/courses");
    setCourses(data.courses || []);
    const fromUrl = searchParams.get("course");
    const preferred = data.courses?.find((c) => c._id === fromUrl)?._id;
    if (!courseId) setCourseId(preferred || data.courses?.[0]?._id || "");
  }

  async function loadSession(id = courseId) {
    if (!id) return;
    setLoading(true);
    setMessage("");
    setLastResult(null);
    try {
      const { data } = await client.get(`/learning/courses/${id}/study-session`);
      setSession(data);
    } catch {
      setSession(null);
      setMessage("No adaptive question is available yet. Upload material and build the course learning model first.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCourses().catch(() => setCourses([])); }, []);
  useEffect(() => { if (courseId) loadSession(courseId); }, [courseId]);

  async function submit() {
    if (!session?.question || submitting) return;
    setSubmitting(true);
    const eventId = `${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${session.question._id}`;
    try {
      const { data } = await client.post("/learning/attempts/durable", {
        eventId,
        courseId,
        questionId: session.question._id,
        answer,
        confidence,
        difficulty: session.question.difficulty,
      }, { headers: { "Idempotency-Key": eventId }});
      setAnswer("");
      setMessage("");
      setLastResult(data.evaluation || null);
      await loadSession();
    } catch {
      setMessage("Couldn't record that attempt. Please try again.");
      setLastResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Adaptive Study</h1>
      <p className="mt-2 text-ink-600">Your next question is selected from your mastery, misconceptions, review state, and course priorities.</p>

      <select
        className="mt-6 w-full rounded-xl border border-ink-100 bg-white p-3"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        <option value="">Choose a course</option>
        {courses.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
      </select>

      {loading ? <p className="mt-8 text-ink-400">Thinking…</p> : session?.question ? (
        <section className="mt-8 rounded-2xl border border-ink-100 bg-white p-6">
          <div className="flex flex-wrap gap-2 text-xs text-ink-500">
            <span>Readiness: {session.state.readiness}%</span>
            <span>·</span>
            <span>Next action: {session.state.nextAction?.type}</span>
            {session.question.cognitiveLevel && (
              <>
                <span>·</span>
                <span className="capitalize">{session.question.cognitiveLevel}</span>
              </>
            )}
          </div>
          <h2 className="mt-5 text-xl font-semibold text-ink-900">{session.question.question}</h2>
          {session.question.type === "mcq" && (
            <div className="mt-5 grid gap-2">
              {session.question.options.map((option) => (
                <button key={option} onClick={() => setAnswer(option)} className={`rounded-xl border p-3 text-left ${answer === option ? "border-ink-900" : "border-ink-100"}`}>
                  {option}
                </button>
              ))}
            </div>
          )}
          {session.question.type !== "mcq" && (
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} className="mt-5 min-h-32 w-full rounded-xl border border-ink-100 p-3" placeholder="Explain your answer…" />
          )}
          <div className="mt-5 flex items-center gap-3">
            <label className="text-sm">Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="rounded-lg border p-2">
              {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}/5</option>)}
            </select>
          </div>

          {lastResult && (
            <section className={`mt-6 rounded-2xl border p-5 ${lastResult.correct ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}>
              <p className="font-semibold text-ink-900">
                {lastResult.correct ? "✓ Correct" : "Not quite"} · {Math.round((lastResult.score ?? 0) * 100)}% score
              </p>
              {lastResult.misconception && (
                <p className="mt-2 text-sm text-ink-600">{lastResult.misconception}</p>
              )}
            </section>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button disabled={!answer || submitting} onClick={submit} className="rounded-full bg-ink-900 px-5 py-2 text-paper disabled:opacity-40">Submit answer</button>
            <button onClick={() => setShowTutor(true)} className="rounded-full border border-ink-900 px-5 py-2 text-ink-900">💡 Explain</button>
            <button onClick={() => setShowAdaptiveTutor(true)} className="rounded-full border border-highlight px-5 py-2 text-ink-900">🎓 Work through it with a tutor</button>
            <button onClick={() => setShowFocusMode(true)} className="rounded-full border border-highlight px-5 py-2 text-highlight">🎯 Focus</button>
          </div>
        </section>
      ) : <p className="mt-8 text-ink-500">{message || "Choose a course to begin."}</p>}

      {message && session?.question && <p className="mt-4 text-sm text-ink-500">{message}</p>}

      {showTutor && session?.question && (
        <div className="fixed inset-0 overflow-y-auto bg-black/50 p-4 md:p-0">
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-ink-900">Let's break this down</h2>
              <button onClick={() => setShowTutor(false)} className="text-ink-400 hover:text-ink-900">✕</button>
            </div>
            <div className="mt-4 max-h-96 overflow-y-auto">
              <TutorResponse
                conceptId={session.question.conceptIds?.[0]?._id || session.question.conceptIds?.[0]}
                misconception={lastResult?.misconception}
              />
            </div>
            <button onClick={() => setShowTutor(false)} className="mt-6 w-full rounded-full bg-ink-900 py-2 text-paper">
              Got it, continue
            </button>
          </div>
        </div>
      )}

      {showAdaptiveTutor && session?.question && (
        <TutorIntervention
          courseId={courseId}
          conceptId={session.question.conceptIds?.[0]?._id || session.question.conceptIds?.[0]}
          onClose={() => { setShowAdaptiveTutor(false); loadSession(); }}
        />
      )}

      {showFocusMode && !focusActive && (
        <FocusMode
          onClose={() => setShowFocusMode(false)}
          onStart={() => { setFocusActive(true); setShowFocusMode(false); }}
        />
      )}

      {focusActive && <FocusMode onClose={() => setFocusActive(false)} />}
    </main>
  );
}
