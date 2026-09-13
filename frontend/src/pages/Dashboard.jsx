import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";
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

  useEffect(() => {
    loadPdfs();
    client
      .get("/chat/recent")
      .then(({ data }) => setRecentChats(data.recent))
      .catch(() => setRecentChats([]));
    client
      .get("/learning/review-queue")
      .then(({ data }) => setReviewQueue(data))
      .catch(() => setReviewQueue(null));
    client
      .get("/learning/courses")
      .then(({ data }) => {
        setCourses(data.courses || []);
        if (data.courses?.length > 0) setSelectedCourse(data.courses[0]._id);
      })
      .catch(() => setCourses([]));
  }, []);

  function loadPdfs() {
    setLoading(true);
    client
      .get("/upload")
      .then(({ data }) => setPdfs(data.pdfs))
      .catch(() => setPdfs([]))
      .finally(() => setLoading(false));
  }

  async function handleDelete(pdf) {
    if (!window.confirm(`Delete "${pdf.filename}"? This removes the file and its chat history — this can't be undone.`)) {
      return;
    }
    setDeletingId(pdf.id);
    try {
      await client.delete(`/upload/${pdf.id}`);
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
    } catch {
      window.alert("Couldn't delete this PDF right now. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Your notes</h1>
      <p className="mt-2 text-ink-600">
        Upload a new PDF, or jump back into one you've already added. Want to search or ask
        questions across everything at once? Try{" "}
        <Link to="/search" className="underline">Search</Link> or{" "}
        <Link to="/chat-all" className="underline">Chat all notes</Link>. Curious how you're
        doing? Check your{" "}
        <Link to="/analytics" className="underline">analytics dashboard</Link>.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/study" className="rounded-full bg-ink-900 px-4 py-2 text-sm text-paper">Your study dashboard</Link>
        <Link to="/review" className="rounded-full border border-ink-900 px-4 py-2 text-sm text-ink-900">Review due material</Link>
      </div>

      {reviewQueue?.dueCount > 0 && (
        <section className="mt-8 rounded-2xl border border-highlight bg-highlight/10 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">
              {reviewQueue.dueCount} concept{reviewQueue.dueCount === 1 ? "" : "s"} due for review
            </h2>
            <Link to="/study" className="rounded-full bg-ink-900 px-4 py-1.5 text-sm text-paper">Review now</Link>
          </div>
          <ul className="mt-3 space-y-1.5">
            {reviewQueue.items.slice(0, 5).map((item) => (
              <li key={item.conceptId} className="flex items-center justify-between text-sm text-ink-600">
                <span>{item.conceptName} <span className="text-ink-400">· {item.courseTitle}</span></span>
                <span className="text-ink-400">{Math.round((item.mastery || 0) * 100)}% mastery</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selectedCourse && (
        <section className="mt-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink-900">Your courses</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGoalModal(true)}
                className="rounded-full border border-ink-900 px-3 py-1.5 text-sm text-ink-900"
              >
                Set goal
              </button>
              <select
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-lg border border-ink-100 p-2 text-sm"
              >
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <TodayStudyCard
            courseId={selectedCourse}
            courseTitle={courses.find((c) => c._id === selectedCourse)?.title}
          />
          <StreakTracker courseId={selectedCourse} />
          <ExamReadiness courseId={selectedCourse} />
          <KnowledgeMap courseId={selectedCourse} />
        </section>
      )}

      {showGoalModal && selectedCourse && (
        <GoalSetup courseId={selectedCourse} onClose={() => setShowGoalModal(false)} />
      )}

      <div className="mt-8">
        <UploadBox onUploaded={loadPdfs} />
      </div>

      <div className="mt-10">
        {loading ? (
          <p className="text-ink-400">Loading…</p>
        ) : pdfs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
            Nothing here yet — upload a PDF above to get started.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {pdfs.map((pdf) => (
              <li
                key={pdf.id}
                className="rounded-xl border border-ink-100 bg-white/70 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold text-ink-900">{pdf.filename}</p>
                  <span className="rounded-full bg-highlight/20 px-3 py-1 text-xs font-medium text-ink-900">
                    {pdf.subject}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-400">
                  {pdf.chunkCount} sections indexed
                  {pdf.extractionMethod === "ocr" && " · processed with OCR"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <Link className="rounded-full bg-ink-900 px-3 py-1 text-paper" to={`/chat/${pdf.id}`}>Chat</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/summary/${pdf.id}`}>Summary</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/flashcards/${pdf.id}`}>Flashcards</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/quiz/${pdf.id}`}>Quiz</Link>
                  <button
                    onClick={() => handleDelete(pdf)}
                    disabled={deletingId === pdf.id}
                    className="ml-auto text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === pdf.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {recentChats.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-ink-900">Recent chats</h2>
          <ul className="mt-4 space-y-2">
            {recentChats.map((c, i) => (
              <li key={i}>
                <Link
                  to={`/chat/${c.pdfId}`}
                  className="flex items-center justify-between rounded-xl border border-ink-100 bg-white/70 px-4 py-3 hover:border-highlight"
                >
                  <div className="min-w-0">
                    <p className="truncate text-ink-900">{c.content}</p>
                    <p className="text-xs text-ink-400">{c.filename}</p>
                  </div>
                  <span className="ml-4 shrink-0 text-xs text-ink-400">
                    {new Date(c.ts).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}