import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import client from "../api/client.js";
import {
  formatExamTimer,
  getTimerUrgency,
  toggleFlaggedQuestion,
  predictGradeBand,
  calculateCognitivePerformance
} from "../utils/examHelpers.js";

const QUESTION_COUNTS = [10, 20, 30];
const TIMER_OPTIONS = [
  { label: "Untimed", value: 0 },
  { label: "15 min", value: 15 * 60 * 1000 },
  { label: "30 min", value: 30 * 60 * 1000 },
  { label: "45 min", value: 45 * 60 * 1000 },
];

export default function ExamMode() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const courseId = searchParams.get("course") || "";

  const [stage, setStage] = useState("setup"); // setup | running | report
  const [totalQuestions, setTotalQuestions] = useState(20);
  const [timerDuration, setTimerDuration] = useState(30 * 60 * 1000); // 30 mins default
  const [examId, setExamId] = useState(null);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [flaggedIds, setFlaggedIds] = useState([]);
  const [answeredHistory, setAnsweredHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const [remainingMs, setRemainingMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const questionStartedAt = useRef(null);
  const examStartedAt = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startExam() {
    setError("");
    try {
      const { data } = await client.post("/exam/start", { courseId, totalQuestions });
      setExamId(data.examId);
      setProgress({ index: 0, total: data.totalQuestions });
      setFlaggedIds([]);
      setAnsweredHistory([]);
      setStage("running");

      examStartedAt.current = Date.now();
      if (timerDuration > 0) {
        setRemainingMs(timerDuration);
        timerRef.current = setInterval(() => {
          const elapsed = Date.now() - examStartedAt.current;
          const left = Math.max(0, timerDuration - elapsed);
          setRemainingMs(left);
          setElapsedMs(elapsed);
          if (left <= 0) {
            clearInterval(timerRef.current);
            finishExamPrematurely(data.examId);
          }
        }, 1000);
      } else {
        timerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - examStartedAt.current);
        }, 1000);
      }

      await loadNext(data.examId);
    } catch (err) {
      setError(err?.response?.data?.error || "Couldn't start an exam for this course.");
    }
  }

  async function finishExamPrematurely(id = examId) {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const { data: reportData } = await client.get(`/exam/${id}/report`);
      setReport(reportData.report);
      setStage("report");
    } catch {
      setError("Exam time elapsed. Unable to generate complete report.");
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
      const { data } = await client.post(`/exam/${examId}/answer`, {
        questionId: question._id,
        answer,
        confidence,
        responseTimeMs,
      });

      setAnsweredHistory((prev) => [
        ...prev,
        {
          questionId: question._id,
          cognitiveLevel: question.cognitiveLevel || "understand",
          correct: data?.evaluation?.correct ?? true,
        },
      ]);

      await loadNext();
    } catch {
      setError("Couldn't record that answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Keyboard shortcut for MCQ (1, 2, 3, 4)
  useEffect(() => {
    function handleKeyDown(e) {
      if (stage !== "running" || !question || question.type !== "mcq" || submitting) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= (question.options?.length || 0)) {
        setAnswer(question.options[num - 1]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stage, question, submitting]);

  const isCurrentFlagged = question ? flaggedIds.includes(question._id) : false;
  const urgency = timerDuration > 0 ? getTimerUrgency(remainingMs, timerDuration) : "normal";

  if (!courseId) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-2xl text-indigo-700">
          📝
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-ink-900">Select a course to start an exam</h2>
        <p className="mt-1 text-sm text-ink-500">Pick an active course from your curriculum to launch an exam simulation.</p>
        <Link to="/study" className="mt-6 inline-block rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-paper">
          Back to Courses
        </Link>
      </main>
    );
  }

  // Setup Stage
  if (stage === "setup") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-sm sm:p-10">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 uppercase tracking-wider">
              Exam Simulator
            </span>
            <span className="text-xs text-ink-400">Adaptive Mock Testing</span>
          </div>

          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Simulated Final Examination
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Questions adaptively target your highest-risk concepts and prerequisite gaps first. Simulates official test
            timing, metacognitive pressure, and cognitive depth.
          </p>

          {/* Question Count Selection */}
          <div className="mt-8 border-t border-ink-100 pt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Exam Length
            </label>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {QUESTION_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTotalQuestions(n)}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-4 transition ${
                    totalQuestions === n
                      ? "border-indigo-600 bg-indigo-50/50 shadow-xs ring-2 ring-indigo-200"
                      : "border-ink-200 bg-paper hover:bg-white text-ink-700"
                  }`}
                >
                  <span className="font-display text-xl font-bold text-ink-900">{n} Questions</span>
                  <span className="mt-0.5 text-xs text-ink-500">~{Math.round(n * 1.5)} minutes</span>
                </button>
              ))}
            </div>
          </div>

          {/* Timer Selection */}
          <div className="mt-6">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Time Limit
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TIMER_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTimerDuration(opt.value)}
                  className={`rounded-2xl border p-3 text-center text-xs font-semibold transition ${
                    timerDuration === opt.value
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-200"
                      : "border-ink-200 bg-paper hover:bg-white text-ink-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Launch Exam CTA */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/study" className="text-xs font-medium text-ink-400 hover:text-ink-800">
              ← Return to Course Hub
            </Link>

            <button
              onClick={startExam}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-7 py-3 text-sm font-semibold text-paper shadow-md transition hover:bg-ink-800"
            >
              <span>🚀</span>
              <span>Begin Exam Simulation</span>
            </button>
          </div>

          {error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}
        </div>
      </main>
    );
  }

  // Running Stage
  if (stage === "running") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Top Floating Exam HUD */}
        <div className="sticky top-16 z-30 mb-6 rounded-2xl border border-ink-100 bg-white/90 p-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-ink-900">
                Question {progress.index + 1} of {progress.total}
              </span>
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 font-semibold text-ink-600">
                {Math.round((progress.index / (progress.total || 1)) * 100)}% complete
              </span>
            </div>

            {/* Timer HUD with Urgency Indicator */}
            <div className="flex items-center gap-3">
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono font-semibold transition ${
                  urgency === "critical"
                    ? "bg-rose-100 text-rose-800 animate-pulse border border-rose-300"
                    : urgency === "warning"
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-ink-50 text-ink-800 border border-ink-200"
                }`}
              >
                <span>⏱️</span>
                <span>
                  {timerDuration > 0
                    ? `Time Left: ${formatExamTimer(remainingMs)}`
                    : `Elapsed: ${formatExamTimer(elapsedMs)}`}
                </span>
              </div>

              {/* Flag for Review */}
              {question && (
                <button
                  type="button"
                  onClick={() => setFlaggedIds(toggleFlaggedQuestion(flaggedIds, question._id))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition ${
                    isCurrentFlagged
                      ? "border border-amber-300 bg-amber-50 text-amber-800 shadow-2xs"
                      : "border border-ink-200 bg-paper text-ink-600 hover:bg-white"
                  }`}
                  title="Bookmark question for review"
                >
                  <span>{isCurrentFlagged ? "🚩" : "🏳️"}</span>
                  <span>{isCurrentFlagged ? "Flagged" : "Flag"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Question Palette Matrix */}
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-ink-100/80 pt-3">
            {Array.from({ length: progress.total }).map((_, idx) => {
              const isCurrent = idx === progress.index;
              const isAnswered = idx < progress.index;
              return (
                <div
                  key={idx}
                  className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold transition ${
                    isCurrent
                      ? "bg-indigo-600 text-white ring-2 ring-indigo-200"
                      : isAnswered
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-ink-50 text-ink-400 border border-ink-100"
                  }`}
                >
                  {idx + 1}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Question Section */}
        {!question ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <p className="mt-3 text-sm text-ink-400">Loading next question…</p>
          </div>
        ) : (
          <section className="rounded-3xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {question.cognitiveLevel && (
                <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-bold uppercase text-indigo-700">
                  {question.cognitiveLevel}
                </span>
              )}
              <span className="text-xs text-ink-400">Press 1-{question.options?.length || 4} to answer</span>
            </div>

            <h2 className="mt-4 font-display text-xl font-semibold leading-relaxed text-ink-900 sm:text-2xl">
              {question.question}
            </h2>

            {/* MCQ Options */}
            {question.type === "mcq" ? (
              <div className="mt-6 grid gap-3">
                {question.options.map((option, idx) => {
                  const isSelected = answer === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => !submitting && setAnswer(option)}
                      className={`group flex items-center justify-between rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/40 shadow-2xs"
                          : "border-ink-200 bg-paper hover:bg-white hover:border-ink-300"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-ink-100 text-ink-700 group-hover:bg-ink-200"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-sm font-medium text-ink-900">{option}</span>
                      </div>
                      <div
                        className={`h-4 w-4 rounded-full border-2 transition ${
                          isSelected ? "border-indigo-600 bg-indigo-600 ring-2 ring-indigo-200" : "border-ink-300"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6">
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-ink-200 bg-paper p-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
                  placeholder="Explain your solution in detail…"
                />
              </div>
            )}

            {/* Metacognitive Confidence Selection */}
            <div className="mt-6 rounded-2xl border border-ink-100 bg-paper p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink-600">
                    Confidence Rating
                  </span>
                  <p className="text-xs text-ink-400">Calibrates readiness prediction</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setConfidence(lvl)}
                      className={`rounded-xl px-3 py-1 text-xs font-semibold transition ${
                        confidence === lvl
                          ? "bg-indigo-600 text-white shadow-2xs"
                          : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                      }`}
                    >
                      {lvl}/5
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit Question Action */}
            <div className="mt-6 flex items-center justify-between">
              <span className="text-xs text-ink-400">
                {progress.index + 1 < progress.total
                  ? `${progress.total - progress.index - 1} questions remaining`
                  : "Final question"}
              </span>

              <button
                disabled={!answer || submitting}
                onClick={submit}
                className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-paper shadow-sm transition hover:bg-ink-800 disabled:opacity-40"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Submitting…</span>
                  </>
                ) : (
                  <span>
                    {progress.index + 1 < progress.total ? "Submit & Next Question →" : "Finish Exam"}
                  </span>
                )}
              </button>
            </div>

            {error && <p className="mt-4 text-xs font-semibold text-rose-600">{error}</p>}
          </section>
        )}
      </main>
    );
  }

  // Report Stage
  const gradeInfo = predictGradeBand(report?.overallPct || 0);
  const cognitiveStats = calculateCognitivePerformance(answeredHistory);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      {/* Top Banner */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-b from-indigo-50/50 via-white to-white p-6 shadow-sm sm:p-10">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 uppercase tracking-wider">
            Completed
          </span>
          <span className="text-xs text-ink-400">Exam Diagnostic Report</span>
        </div>

        <h1 className="mt-3 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
          Examination Performance Analysis
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Based on {report.answered} questions completed in {formatExamTimer(elapsedMs)}.
        </p>

        {/* Bento Metrics Grid */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
            <span className="text-xs font-medium text-ink-400">Overall Accuracy</span>
            <p className="mt-1 font-display text-4xl font-extrabold text-ink-900">{report.overallPct}%</p>
            <span className="text-xs text-ink-500">{report.answered} questions evaluated</span>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
            <span className="text-xs font-medium text-ink-400">Predicted Score Range</span>
            <p className="mt-1 font-display text-3xl font-extrabold text-indigo-700">
              {report.predictedRange[0]}–{report.predictedRange[1]}%
            </p>
            <span className="text-xs text-ink-500">95% confidence interval</span>
          </div>

          <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
            <span className="text-xs font-medium text-ink-400">Assigned Grade Band</span>
            <p className="mt-1 font-display text-lg font-bold text-ink-900">{gradeInfo.band}</p>
            <span className="text-xs text-ink-500">Simulated standing</span>
          </div>
        </div>

        {/* Cognitive Domain Performance */}
        {cognitiveStats.length > 0 && (
          <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-700">
              Bloom's Taxonomy Performance
            </h3>
            <div className="mt-3 space-y-3">
              {cognitiveStats.map((stat) => (
                <div key={stat.domain} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink-800">{stat.domain}</span>
                    <span className="font-mono text-ink-500">
                      {stat.correct}/{stat.total} ({stat.percentage}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* High Risk and Strong Areas */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {report.strong.length > 0 && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
                <span>✅</span>
                <span>Demonstrated Strengths</span>
              </h4>
              <ul className="mt-3 space-y-1.5">
                {report.strong.map((c) => (
                  <li key={c.conceptId} className="rounded-xl bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-2xs">
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.weak.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
              <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                <span>⚠️</span>
                <span>Immediate Priority Gaps</span>
              </h4>
              <ul className="mt-3 space-y-1.5">
                {report.weak.map((c) => (
                  <li key={c.conceptId} className="flex items-center justify-between rounded-xl bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-900 shadow-2xs">
                    <span>{c.name}</span>
                    <span className="font-bold">{Math.round(c.accuracy * 100)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action CTAs */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={() => navigate(`/study-session?course=${courseId}`)}
            className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow-sm transition hover:bg-ink-800"
          >
            <span>🚀</span>
            <span>Launch Targeted Study Session</span>
          </button>
          <button
            onClick={() => {
              setStage("setup");
            }}
            className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
          >
            Take Another Exam
          </button>
          <Link
            to="/study"
            className="rounded-xl px-4 py-3 text-sm font-medium text-ink-500 hover:text-ink-900"
          >
            Return to Courses
          </Link>
        </div>
      </div>
    </main>
  );
}
