import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client, { formatApiError } from "../api/client.js";
import UploadBox from "../components/UploadBox.jsx";
import KnowledgeMap from "../components/KnowledgeMap.jsx";
import StreakTracker from "../components/StreakTracker.jsx";
import GoalSetup from "../components/GoalSetup.jsx";
import ExamReadiness from "../components/ExamReadiness.jsx";
import TodayStudyCard from "../components/TodayStudyCard.jsx";

export default function Dashboard() {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [recentChats, setRecentChats] = useState([]);
  const [reviewQueue, setReviewQueue] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    loadPdfs(controller.signal);
    client
      .get("/chat/recent", { signal: controller.signal })
      .then(({ data }) => setRecentChats(data.recent))
      .catch(() => {
        if (!controller.signal.aborted) setRecentChats([]);
      });
    client
      .get("/learning/review-queue", { signal: controller.signal })
      .then(({ data }) => setReviewQueue(data))
      .catch(() => {
        if (!controller.signal.aborted) setReviewQueue(null);
      });
    client
      .get("/learning/courses", { signal: controller.signal })
      .then(({ data }) => {
        setCourses(data.courses || []);
        if (data.courses?.length > 0) setSelectedCourse(data.courses[0]._id);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCourses([]);
      });

    return () => {
      controller.abort();
    };
  }, []);

  function loadPdfs(signal) {
    setLoading(true);
    setLoadError("");
    client
      .get("/upload", signal ? { signal } : {})
      .then(({ data }) => setPdfs(data.pdfs))
      .catch((err) => {
        if (signal?.aborted) return;
        setLoadError(formatApiError(err, "Couldn't load your notes right now."));
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }

  async function handleDelete(pdf) {
    if (!window.confirm(`Delete "${pdf.filename}"? This removes the file and its chat history — this can't be undone.`)) {
      return;
    }
    setDeletingId(pdf.id);
    setDeleteError("");
    try {
      await client.delete(`/upload/${pdf.id}`);
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
    } catch (err) {
      setDeleteError(formatApiError(err, "Couldn't delete this PDF right now. Please try again."));
    } finally {
      setDeletingId(null);
    }
  }

  const selectedCourseObj = courses.find((c) => c._id === selectedCourse);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Bar / Header Section */}
      <div className="flex flex-col gap-4 border-b border-ink-100/80 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
            AI Study Workspace
          </span>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
            Learning Studio
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Personalized cognitive pacing, adaptive spaced retrieval, and knowledge mapping.
          </p>
        </div>

        {/* Quick Nav Action Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/search"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
          >
            <span>🔍</span>
            <span>Global Search</span>
          </Link>
          <Link
            to="/chat-all"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
          >
            <span>💬</span>
            <span>Chat Across Notes</span>
          </Link>
          <Link
            to="/analytics"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
          >
            <span>📊</span>
            <span>Analytics</span>
          </Link>
          <Link
            to="/review"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper shadow hover:bg-ink-800 transition"
          >
            <span>🔄</span>
            <span>Spaced Review</span>
          </Link>
        </div>
      </div>

      {/* Errors Alerts */}
      {deleteError && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError("")} className="font-semibold text-red-800 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {loadError && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{loadError}</span>
          <button onClick={loadPdfs} className="font-semibold text-red-800 underline hover:text-red-950">
            Try again
          </button>
        </div>
      )}

      {/* Spaced Review Catch-Up Ribbon */}
      {reviewQueue?.dueCount > 0 ? (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200/60 text-lg">
                ⏳
              </span>
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  {reviewQueue.dueCount} concept{reviewQueue.dueCount === 1 ? "" : "s"} due for spaced retrieval
                </h3>
                <p className="text-xs text-amber-800">
                  Memory retention decays over time. Strengthen foundations before starting new chapters.
                </p>
              </div>
            </div>
            <Link
              to="/review"
              className="inline-flex items-center justify-center rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-950 transition"
            >
              Start Review Session →
            </Link>
          </div>
        </section>
      ) : reviewQueue && reviewQueue.dueCount === 0 ? (
        <section className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎉</span>
              <div>
                <p className="font-semibold text-emerald-950 text-sm">You're all caught up on spaced reviews!</p>
                <p className="text-xs text-emerald-700">No concepts are due for review right now. Ready for fresh material.</p>
              </div>
            </div>
            <Link to="/review" className="text-xs font-semibold text-emerald-800 underline hover:text-emerald-950">
              View queue
            </Link>
          </div>
        </section>
      ) : null}

      {/* Bento Grid Adaptive Core Showcase */}
      {selectedCourse && (
        <section className="mt-8 space-y-4">
          {/* Course Selector Header Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-ink-100 bg-white/80 p-4 shadow-xs backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎓</span>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">Active Course</span>
                <h2 className="font-display text-lg font-bold text-ink-900">
                  {selectedCourseObj?.title || "Course Overview"}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-800 shadow-2xs hover:border-ink-300 focus:outline-hidden"
              >
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowGoalModal(true)}
                className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
              >
                Set Goal 🎯
              </button>
            </div>
          </div>

          {/* Asymmetrical Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
            {/* Bento Cell 1: Next Best Action Hero Card (Col Span 8) */}
            <div className="md:col-span-8 flex flex-col">
              <TodayStudyCard
                courseId={selectedCourse}
                courseTitle={selectedCourseObj?.title}
              />
            </div>

            {/* Bento Cell 2: Radial Exam Readiness Gauge (Col Span 4) */}
            <div className="md:col-span-4 flex flex-col">
              <ExamReadiness courseId={selectedCourse} />
            </div>

            {/* Bento Cell 3: Study Momentum & Streak (Col Span 4) */}
            <div className="md:col-span-4 flex flex-col">
              <StreakTracker courseId={selectedCourse} />
            </div>

            {/* Bento Cell 4: Course Focus Actions (Col Span 8) */}
            <div className="md:col-span-8 flex flex-col justify-between rounded-2xl border border-ink-100 bg-gradient-to-br from-white via-paper/50 to-indigo-50/30 p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Adaptive Hub</span>
                  <h3 className="font-display text-xl font-bold text-ink-900">Targeted Learning Sessions</h3>
                  <p className="mt-1 text-xs text-ink-600">
                    Step into an AI-guided session configured around your active misconceptions and weakest prerequisites.
                  </p>
                </div>
                <span className="hidden sm:inline-flex text-3xl">🧭</span>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-ink-100/70">
                <Link
                  to={`/study-session?course=${selectedCourse}&minutes=15`}
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-xs font-semibold text-paper shadow hover:bg-ink-800 transition"
                >
                  ⚡ 15-Minute Sprint
                </Link>
                <Link
                  to={`/study-session?course=${selectedCourse}&minutes=25`}
                  className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-semibold text-ink-800 shadow-2xs hover:bg-ink-50 transition"
                >
                  ⏱️ 25-Minute Deep Focus
                </Link>
                <Link
                  to={`/adaptive-study?course=${selectedCourse}`}
                  className="rounded-full border border-indigo-200 bg-indigo-50/80 px-5 py-2.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 transition"
                >
                  🎓 Interactive AI Tutor
                </Link>
              </div>
            </div>

            {/* Bento Cell 5: Knowledge Map (Col Span 12 Full Width) */}
            <div className="md:col-span-12">
              <KnowledgeMap courseId={selectedCourse} />
            </div>
          </div>
        </section>
      )}

      {/* Goal Setup Modal */}
      {showGoalModal && selectedCourse && (
        <GoalSetup courseId={selectedCourse} onClose={() => setShowGoalModal(false)} />
      )}

      {/* Upload Zone */}
      <section className="mt-12">
        <div className="mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Ingest Knowledge</span>
          <h2 className="font-display text-2xl font-bold text-ink-900">Upload Study Material</h2>
          <p className="text-xs text-ink-500">
            PDFs, slides, audio lectures, and YouTube videos are parsed into knowledge concepts and interactive flashcards.
          </p>
        </div>
        <UploadBox onUploaded={loadPdfs} />
      </section>

      {/* Document Library Section */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Your Shelf</span>
            <h2 className="font-display text-2xl font-bold text-ink-900">Study Materials</h2>
          </div>
          <span className="text-xs font-medium text-ink-500">
            {pdfs.length} document{pdfs.length === 1 ? "" : "s"} indexed
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl border border-ink-100 bg-white p-5 animate-pulse">
                <div className="h-5 w-40 rounded bg-ink-100 mb-2" />
                <div className="h-4 w-24 rounded bg-ink-100" />
              </div>
            ))}
          </div>
        ) : pdfs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-8 text-center sm:p-12 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-highlight/20 text-2xl">
              📚
            </div>
            <h3 className="mt-4 font-display text-lg font-semibold text-ink-900">Your study space is empty</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
              Upload your lecture slides, notes, or textbook chapters above to unlock flashcards, practice quizzes, and an adaptive AI study coach.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pdfs.map((pdf) => (
              <li
                key={pdf.id}
                className="flex flex-col justify-between rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs hover:shadow-md hover:border-ink-200 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-ink-900 truncate" title={pdf.filename}>
                      {pdf.filename}
                    </h3>
                    <span className="shrink-0 rounded-full bg-highlight/20 px-2.5 py-0.5 text-[10px] font-semibold text-ink-900">
                      {pdf.subject || "General"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {pdf.chunkCount} sections indexed
                    {pdf.extractionMethod === "ocr" && " · OCR"}
                  </p>
                </div>

                <div className="mt-5 border-t border-ink-50 pt-4">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Link
                      className="rounded-full bg-ink-900 px-3 py-1 font-semibold text-paper hover:bg-ink-800 transition"
                      to={`/chat/${pdf.id}`}
                    >
                      Chat
                    </Link>
                    <Link
                      className="rounded-full border border-ink-200 px-3 py-1 font-medium text-ink-700 hover:bg-ink-50 transition"
                      to={`/summary/${pdf.id}`}
                    >
                      Summary
                    </Link>
                    <Link
                      className="rounded-full border border-ink-200 px-3 py-1 font-medium text-ink-700 hover:bg-ink-50 transition"
                      to={`/flashcards/${pdf.id}`}
                    >
                      Cards
                    </Link>
                    <Link
                      className="rounded-full border border-ink-200 px-3 py-1 font-medium text-ink-700 hover:bg-ink-50 transition"
                      to={`/quiz/${pdf.id}`}
                    >
                      Quiz
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(pdf)}
                      disabled={deletingId === pdf.id}
                      className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      {deletingId === pdf.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent Chats */}
      {recentChats.length > 0 && (
        <section className="mt-12">
          <div className="mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">Context History</span>
            <h2 className="font-display text-2xl font-bold text-ink-900">Recent Chats</h2>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {recentChats.map((c, i) => (
              <li key={i}>
                <Link
                  to={`/chat/${c.pdfId}`}
                  className="flex flex-col justify-between rounded-xl border border-ink-100 bg-white p-4 shadow-2xs hover:shadow-xs hover:border-ink-200 transition"
                >
                  <p className="text-sm font-medium text-ink-900 line-clamp-2">"{c.content}"</p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink-400">
                    <span className="truncate max-w-[200px]">{c.filename}</span>
                    <span>{new Date(c.ts).toLocaleDateString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
