import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import client from "../api/client.js";

const QUESTION_COUNTS = [10, 20, 30];

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ExamMode() {
  const [searchParams] = useSearchParams();
  const courseId = searchParams.get("course") || "";

  const [stage, setStage] = useState("setup"); // setup | running | report
  const [totalQuestions, setTotalQuestions] = useState(20);
  const [examId, setExamId] = useState(null);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const questionStartedAt = useRef(null);
  const examStartedAt = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function startExam() {
    setError("");
    try {
      const { data } = await client.post("/exam/start", { courseId, totalQuestions });
      setExamId(data.examId);
      setProgress({ index: 0, total: data.totalQuestions });
      setStage("running");
      examStartedAt.current = Date.now();
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - examStartedAt.current), 1000);
      await loadNext(data.examId);
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't start an exam for this course.");
    }
  }

  async function loadNext(id = examId) {
    setQuestion(null);
    setAnswer("");
    try {
      const { data } = await client.get(`/exam/${id}/next`);
      setProgress(data.progress);
      if (data.done) {
        if (timerRef.current) clearInterval(timerRef.current);
        const { data: reportData } = await client.get(`/exam/${id}/report`);
        setReport(reportData.report);
        setStage("report");
        return;
      }
      setQuestion(data.question);
      questionStartedAt.current = Date.now();
    } catch {
      setError("Couldn't load the next question.");
    }
  }

  async function submit() {
    if (!question || submitting) return;
    setSubmitting(true);
    setError("");
    const responseTimeMs = questionStartedAt.current ? Date.now() - questionStartedAt.current : null;
    try {
      await client.post(`/exam/${examId}/answer`, {
        questionId: question._id,
        answer,
        confidence,
        responseTimeMs,
      });
      await loadNext();
    } catch {
      setError("Couldn't record that answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!courseId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-ink-500">Pick a course to start a mock exam.</p>
        <Link to="/study" className="mt-4 inline-block rounded-full bg-ink-900 px-5 py-2 text-paper">Back to dashboard</Link>
      </main>
    );
  }

  if (stage === "setup") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Mock exam</h1>
        <p className="mt-2 text-ink-600">
          Questions are drawn from your weakest, most important concepts first. Difficulty adapts as you
          go — answer well and it gets harder, struggle and it eases up.
        </p>
        <p className="mt-4 text-sm font-medium text-ink-900">How many questions?</p>
        <div className="mt-2 flex gap-2">
          {QUESTION_COUNTS.map((n) => (
            <button
              key={n}
              onClick={() => setTotalQuestions(n)}
              className={`rounded-full border px-4 py-1.5 text-sm ${totalQuestions === n ? "border-ink-900 bg-ink-900 text-paper" : "border-ink-100 text-ink-900"}`}
            >
              {n}
            </button>
          ))}
        </div>
        <button onClick={startExam} className="mt-8 rounded-full bg-ink-900 px-6 py-2.5 text-paper">Start exam</button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-8">
          <Link to="/study" className="text-sm text-ink-400">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  if (stage === "running") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between text-sm text-ink-400">
          <span>Question {progress.index + 1} of {progress.total}</span>
          <span>{formatElapsed(elapsedMs)}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-highlight" style={{ width: `${progress.total ? (progress.index / progress.total) * 100 : 0}%` }} />
        </div>

        {!question ? (
          <p className="mt-10 text-ink-400">Loading…</p>
        ) : (
          <section className="mt-6 rounded-2xl border border-ink-100 bg-white p-6">
            <h2 className="text-lg font-semibold text-ink-900">{question.question}</h2>
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
                placeholder="Write your answer…"
              />
            )}
            <div className="mt-5 flex items-center gap-3">
              <label className="text-sm">Confidence</label>
              <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="rounded-lg border p-2">
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
              </select>
            </div>
            <div className="mt-6">
              <button disabled={!answer || submitting} onClick={submit} className="rounded-full bg-ink-900 px-5 py-2 text-paper disabled:opacity-40">
                {submitting ? "Recording…" : progress.index + 1 < progress.total ? "Next question" : "Finish exam"}
              </button>
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>
        )}
      </main>
    );
  }

  // stage === "report"
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Exam complete</h1>
      <section className="mt-6 flex items-center gap-6 rounded-2xl border border-ink-100 bg-white/70 p-6">
        <div>
          <span className="font-display text-4xl font-semibold text-ink-900">{report.overallPct}%</span>
          <p className="text-xs text-ink-400">overall</p>
        </div>
        <p className="text-sm text-ink-600">
          Predicted score range: <span className="font-medium text-ink-900">{report.predictedRange[0]}–{report.predictedRange[1]}%</span>
          <br />
          Based on {report.answered} question{report.answered === 1 ? "" : "s"}.
        </p>
      </section>

      {report.strong.length > 0 && (
        <section className="mt-6">
          <h3 className="font-display text-lg font-semibold text-ink-900">You're strong on</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.strong.map((c) => (
              <li key={c.conceptId} className="rounded-full bg-sage/20 px-3 py-1 text-sm text-ink-900">{c.name}</li>
            ))}
          </ul>
        </section>
      )}

      {report.weak.length > 0 && (
        <section className="mt-6">
          <h3 className="font-display text-lg font-semibold text-ink-900">Highest risk</h3>
          <ul className="mt-2 space-y-2">
            {report.weak.map((c) => (
              <li key={c.conceptId} className="flex items-center justify-between rounded-xl border border-ink-100 bg-white p-3 text-sm">
                <span className="font-medium text-ink-900">{c.name}</span>
                <span className="text-ink-500">{Math.round(c.accuracy * 100)}% correct{c.misconceptions > 0 ? " · misconception found" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 flex gap-3">
        <Link to="/study" className="rounded-full bg-ink-900 px-5 py-2 text-paper">Back to dashboard</Link>
        <button
          onClick={() => { window.location.href = `/exam?course=${courseId}`; }}
          className="rounded-full border border-ink-900 px-5 py-2 text-ink-900"
        >
          Take another
        </button>
      </div>
    </main>
  );
}
