import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import client from "../api/client.js";
import {
  calculateDiagnosticScore,
  getDifficultyLabel,
  getCognitiveBadge,
  getConfidenceFeedback,
  generateDiagnosticCertificateData
} from "../utils/diagnosticHelpers.js";

export default function DiagnosticTest() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(searchParams.get("course") || "");
  const [sessionId, setSessionId] = useState(null);
  const [progressCount, setProgressCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [current, setCurrent] = useState(null); // { question, conceptId, conceptName, reason } | null
  const [done, setDone] = useState(false);
  const [doneReason, setDoneReason] = useState(null);
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState("");
  const [certificateData, setCertificateData] = useState(null);

  async function loadCourses() {
    const { data } = await client.get("/learning/courses");
    setCourses(data.courses || []);
    const fromUrl = searchParams.get("course");
    const preferred = data.courses?.find((c) => c._id === fromUrl)?._id;
    if (!courseId) setCourseId(preferred || data.courses?.[0]?._id || "");
  }

  // Creates a new diagnostic session or resumes active session
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
      const currentCourse = courses.find((c) => c._id === courseId);
      const score = calculateDiagnosticScore(progressCount, correctCount);
      setCertificateData(
        generateDiagnosticCertificateData({
          courseTitle: currentCourse?.title || "Course Baseline",
          answeredCount: progressCount,
          scorePercentage: score,
          durationMinutes: Math.max(2, Math.round(progressCount * 1.5))
        })
      );
    } else {
      setDone(false);
      setCurrent(data);
      setAnswer("");
      setLastResult(null);
    }
  }

  useEffect(() => {
    loadCourses().catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (courseId) {
      setProgressCount(0);
      setCorrectCount(0);
      setDone(false);
      setCertificateData(null);
      start();
    }
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
          eventId,
          courseId,
          questionId: current.question._id,
          answer,
          confidence,
          difficulty: current.question.difficulty || 1,
          diagnosticSessionId: sessionId,
        },
        { headers: { "Idempotency-Key": eventId } }
      );
      const evalResult = data.evaluation || null;
      setLastResult(evalResult);
      if (evalResult?.correct) {
        setCorrectCount((c) => c + 1);
      }
      setProgressCount((n) => n + 1);
      setTimeout(() => loadNext(sessionId), 1200);
    } catch {
      setError("Couldn't record that answer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Keyboard shortcut for MCQ options (1, 2, 3, 4)
  useEffect(() => {
    function handleKeyDown(e) {
      if (!current?.question || current.question.type !== "mcq" || submitting || lastResult) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= (current.question.options?.length || 0)) {
        setAnswer(current.question.options[num - 1]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [current, submitting, lastResult]);

  const currentCourse = courses.find((c) => c._id === courseId);
  const diffMeta = current?.question ? getDifficultyLabel(current.question.difficulty || 1) : null;
  const cogMeta = current?.question?.cognitiveLevel ? getCognitiveBadge(current.question.cognitiveLevel) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              Adaptive Placement
            </span>
            <span className="text-xs text-ink-400">Computerized Adaptive Testing</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Course Diagnostic
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Pinpoints your exact zone of proximal development without repetitive guessing.
          </p>
        </div>

        {/* Course Picker */}
        <div className="w-full sm:w-72">
          <label className="text-xs font-medium text-ink-500">Active Course</label>
          <select
            className="mt-1 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-900 shadow-sm focus:border-ink-900 focus:outline-none"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress & Difficulty Gauge Bar */}
      {courseId && !done && (
        <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-ink-900">
                Question {progressCount + 1}
              </span>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-600">
                {progressCount} answered
              </span>
            </div>

            {diffMeta && (
              <div className="flex items-center gap-2">
                <span className="text-ink-400">Current Difficulty:</span>
                <span className={`rounded-md border px-2 py-0.5 font-medium ${diffMeta.color}`}>
                  Level {diffMeta.level} · {diffMeta.label}
                </span>
                {/* 5-segment difficulty visualizer */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <div
                      key={lvl}
                      className={`h-2 w-3 rounded-sm transition-all duration-300 ${
                        lvl <= diffMeta.level ? "bg-indigo-600" : "bg-ink-100"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="mt-12 flex flex-col items-center justify-center p-12 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-ink-600">Selecting optimal diagnostic question…</p>
          <span className="mt-1 text-xs text-ink-400">Calibrating against Bayesian knowledge parameters</span>
        </div>
      ) : done && doneReason === "empty_bank" ? (
        <section className="mt-8 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-2xl text-amber-700">
            📚
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-ink-900">No diagnostic questions ready</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
            This course does not have diagnostic items generated yet. Upload course materials or lecture notes first,
            and our pipeline will construct concepts and questions automatically.
          </p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-6 inline-flex items-center rounded-xl bg-ink-900 px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-800"
          >
            Go to Upload Hub
          </button>
        </section>
      ) : done ? (
        /* Baseline Diagnostic Certificate & Readiness Report */
        <section className="mt-8 space-y-6">
          <div className="relative overflow-hidden rounded-3xl border-2 border-indigo-100 bg-gradient-to-b from-indigo-50/50 via-white to-white p-8 shadow-sm">
            {/* Top Certificate Header */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-2xl text-white shadow-lg ring-8 ring-indigo-50">
                🎓
              </div>
              <span className="mt-4 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                Baseline Diagnostic Certificate
              </span>
              <h2 className="mt-2 font-display text-2xl font-bold text-ink-900 sm:text-3xl">
                Diagnostic Complete: {currentCourse?.title || "Course Baseline"}
              </h2>
              <p className="mt-2 max-w-lg text-sm text-ink-600">
                Your conceptual strengths, memory boundaries, and adaptive baseline have been calibrated.
              </p>
            </div>

            {/* Certificate Metrics Grid */}
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
                <span className="text-xs font-medium text-ink-400">Questions Tested</span>
                <p className="mt-1 font-display text-3xl font-bold text-ink-900">{progressCount}</p>
                <span className="text-xs text-ink-500">Adaptive items answered</span>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
                <span className="text-xs font-medium text-ink-400">Accuracy Baseline</span>
                <p className="mt-1 font-display text-3xl font-bold text-emerald-600">
                  {calculateDiagnosticScore(progressCount, correctCount)}%
                </p>
                <span className="text-xs text-ink-500">{correctCount} of {progressCount} correct</span>
              </div>

              <div className="rounded-2xl border border-ink-100 bg-paper p-5 text-center">
                <span className="text-xs font-medium text-ink-400">Assigned Tier</span>
                <p className="mt-1 font-display text-lg font-bold text-indigo-700">
                  {certificateData?.tier || "Proficient"}
                </p>
                <span className="text-xs text-ink-500">Curriculum readiness</span>
              </div>
            </div>

            {/* Strategic Recommendation */}
            <div className="mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="text-lg">💡</span>
                <div>
                  <h4 className="text-sm font-semibold text-indigo-950">Targeted Learning Recommendation</h4>
                  <p className="mt-1 text-sm text-indigo-900">
                    {certificateData?.readinessStatement ||
                      "Your diagnostic profile has been saved. Spaced retrieval and study sessions will focus on high-yield gaps."}
                  </p>
                  <p className="mt-2 text-xs text-indigo-600">
                    Certificate ID: {certificateData?.id} · Verified on {certificateData?.issuedDate}
                  </p>
                </div>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => navigate(`/study-session?course=${courseId}`)}
                className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow-md transition hover:bg-ink-800"
              >
                <span>🚀</span>
                <span>Launch Recommended Focus Session</span>
              </button>
              <button
                onClick={() => navigate(`/study?course=${courseId}`)}
                className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50"
              >
                <span>🗺️</span>
                <span>View Knowledge Map</span>
              </button>
              <Link
                to="/dashboard"
                className="inline-flex items-center rounded-xl px-4 py-3 text-sm font-medium text-ink-500 hover:text-ink-900"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </section>
      ) : current?.question ? (
        /* Active Question Card */
        <section className="mt-6 rounded-3xl border border-ink-100 bg-white p-6 shadow-sm sm:p-8">
          {/* Concept & Bloom Metadata */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {current.conceptName && (
              <span className="rounded-md bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
                {current.conceptName}
              </span>
            )}
            {cogMeta && (
              <span className={`rounded-md border px-2.5 py-1 font-medium ${cogMeta.bg}`}>
                {cogMeta.label}
              </span>
            )}
            <span className="ml-auto text-xs text-ink-400">
              Press 1-{current.question.options?.length || 4} on keyboard
            </span>
          </div>

          {/* Question Text */}
          <h2 className="mt-5 font-display text-xl font-semibold leading-relaxed text-ink-900 sm:text-2xl">
            {current.question.question}
          </h2>

          {/* Answer Options */}
          {current.question.type === "mcq" ? (
            <div className="mt-6 grid gap-3">
              {current.question.options.map((option, idx) => {
                const isSelected = answer === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !submitting && !lastResult && setAnswer(option)}
                    disabled={submitting || !!lastResult}
                    className={`group flex items-center justify-between rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-indigo-600 bg-indigo-50/40 shadow-sm"
                        : "border-ink-100 bg-paper hover:border-ink-300 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold ${
                          isSelected
                            ? "bg-indigo-600 text-white"
                            : "bg-ink-100 text-ink-600 group-hover:bg-ink-200"
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
                disabled={submitting || !!lastResult}
                rows={4}
                className="w-full rounded-2xl border border-ink-200 bg-paper p-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-indigo-600 focus:bg-white focus:outline-none"
                placeholder="Type your explanation or thought process here…"
              />
            </div>
          )}

          {/* Metacognitive Confidence Selector */}
          <div className="mt-6 rounded-2xl border border-ink-100 bg-paper p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-ink-600">
                  Confidence Rating
                </label>
                <p className="text-xs text-ink-400">How certain are you of this answer?</p>
              </div>
              <div className="flex items-center gap-1.5">
                {[
                  { level: 1, label: "Guess" },
                  { level: 2, label: "Low" },
                  { level: 3, label: "Medium" },
                  { level: 4, label: "High" },
                  { level: 5, label: "Certain" },
                ].map((item) => (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => setConfidence(item.level)}
                    className={`rounded-xl px-2.5 py-1 text-xs font-semibold transition ${
                      confidence === item.level
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    {item.level} · {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Instant Metacognitive Calibration Feedback */}
          {lastResult && (
            <div
              className={`mt-6 rounded-2xl border p-4 transition-all duration-300 ${
                lastResult.correct
                  ? "border-emerald-300 bg-emerald-50/80 text-emerald-900"
                  : "border-amber-300 bg-amber-50/80 text-amber-900"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{lastResult.correct ? "✅" : "⚠️"}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">
                      {lastResult.correct ? "Accurate Response" : "Conceptual Gap Detected"}
                    </p>
                    <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium">
                      Next question loading…
                    </span>
                  </div>
                  {(() => {
                    const feedback = getConfidenceFeedback(confidence, lastResult.correct);
                    return (
                      <p className="mt-1 text-xs leading-relaxed opacity-90">
                        <strong className="font-semibold">{feedback.headline}:</strong> {feedback.note}
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-ink-400">
              {current.reason ? `Targeting: ${current.reason}` : "Adaptive concept checkpoint"}
            </span>

            <button
              disabled={!answer || submitting || !!lastResult}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-2.5 text-sm font-semibold text-paper shadow-sm transition hover:bg-ink-800 disabled:opacity-40"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Evaluating…</span>
                </>
              ) : (
                <span>Submit Answer →</span>
              )}
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-8 rounded-2xl border border-ink-100 bg-white p-8 text-center">
          <p className="text-sm text-ink-500">
            {error || "No diagnostic questions are available yet for this course."}
          </p>
        </div>
      )}

      {error && current?.question && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      )}
    </main>
  );
}
