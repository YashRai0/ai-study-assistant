import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";
import TactileFlashcard from "../components/TactileFlashcard.jsx";

const RATINGS = [
  { label: "Again", key: "1", quality: 0, className: "bg-red-600 hover:bg-red-700 text-white shadow-xs" },
  { label: "Hard", key: "2", quality: 3, className: "border border-ink-200 hover:bg-ink-50 text-ink-900 bg-white shadow-2xs" },
  { label: "Good", key: "3", quality: 4, className: "bg-ink-900 hover:bg-ink-800 text-paper shadow-xs" },
  { label: "Easy", key: "4", quality: 5, className: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs" },
];

export default function Review() {
  const [activeTab, setActiveTab] = useState("concepts"); // "concepts" | "flashcards"
  const [conceptQueue, setConceptQueue] = useState(null);
  const [conceptLoading, setConceptLoading] = useState(true);

  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("All subjects");
  const [queue, setQueue] = useState(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    client.get("/search/subjects").then(({ data }) => setSubjects(data.subjects)).catch(() => setSubjects([]));
    loadConceptQueue();
  }, []);

  function loadConceptQueue() {
    setConceptLoading(true);
    client
      .get("/learning/review-queue")
      .then(({ data }) => setConceptQueue(data.items || []))
      .catch(() => setConceptQueue([]))
      .finally(() => setConceptLoading(false));
  }

  useEffect(() => {
    if (activeTab === "flashcards") {
      loadQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, activeTab]);

  function loadQueue() {
    setLoading(true);
    setIndex(0);
    setFlipped(false);
    setReviewedCount(0);
    const params = subject === "All subjects" ? {} : { subject };
    client
      .get("/flashcards/due/queue", { params })
      .then(({ data }) => setQueue(data.cards))
      .catch(() => setQueue([]))
      .finally(() => setLoading(false));
  }

  const rate = useCallback(async (quality) => {
    if (rating || !queue?.[index]) return;
    setRating(true);
    try {
      await client.post(`/flashcards/${queue[index]._id}/review`, { quality });
      setReviewedCount((c) => c + 1);
      setFlipped(false);
      setIndex((i) => i + 1);
    } catch {
      setFlipped(false);
      setIndex((i) => i + 1);
    } finally {
      setRating(false);
    }
  }, [queue, index, rating]);

  const card = queue?.[index];
  const remaining = queue ? Math.max(queue.length - index, 0) : 0;
  const conceptDueCount = conceptQueue?.length ?? 0;

  // Keyboard navigation & ratings hotkeys
  useEffect(() => {
    function handleKeyDown(e) {
      if (activeTab !== "flashcards" || !card) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (flipped && !rating) {
        if (e.key === "1") {
          e.preventDefault();
          rate(0);
        } else if (e.key === "2") {
          e.preventDefault();
          rate(3);
        } else if (e.key === "3") {
          e.preventDefault();
          rate(4);
        } else if (e.key === "4") {
          e.preventDefault();
          rate(5);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, card, flipped, rating, rate]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
          Spaced Retrieval Center
        </span>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900 sm:text-4xl">
          Memory Review
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Strengthen long-term retention before the forgetting curve sets in.
        </p>

        {/* Mode Selector Tabs */}
        <div className="mt-6 inline-flex rounded-full border border-ink-100 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("concepts")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition ${
              activeTab === "concepts"
                ? "bg-ink-900 text-paper shadow-xs"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <span>Concepts Due</span>
            {conceptDueCount > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  activeTab === "concepts" ? "bg-amber-400 text-ink-900" : "bg-amber-100 text-amber-800"
                }`}
              >
                {conceptDueCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("flashcards")}
            className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
              activeTab === "flashcards"
                ? "bg-ink-900 text-paper shadow-xs"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Flashcard Decks
          </button>
        </div>
      </div>

      {/* CONCEPTS TAB */}
      {activeTab === "concepts" && (
        <section className="mt-8">
          {conceptLoading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <p className="mt-3 text-xs text-ink-400">Analyzing spaced review schedule…</p>
            </div>
          ) : !conceptQueue?.length ? (
            <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/40 p-8 text-center sm:p-12 shadow-xs">
              <span className="text-4xl">🎉</span>
              <h2 className="mt-3 font-display text-lg font-bold text-emerald-950">
                You're completely caught up on concept reviews!
              </h2>
              <p className="mx-auto mt-1 max-w-md text-xs text-emerald-700 leading-relaxed">
                No concepts are due for review right now. Keep exploring new material or practice flashcard decks.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("flashcards")}
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-xs font-semibold text-paper hover:bg-ink-800 transition shadow-xs"
                >
                  Review Flashcards →
                </button>
                <Link
                  to="/dashboard"
                  className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-ink-500 px-1">
                <span className="font-medium">
                  {conceptQueue.length} concept{conceptQueue.length === 1 ? "" : "s"} due for spaced retrieval
                </span>
                <span className="text-[11px] font-semibold text-indigo-600">Prioritized by forgetting risk</span>
              </div>

              <div className="grid gap-3">
                {conceptQueue.map((item) => {
                  const masteryPct = Math.round((item.mastery || 0) * 100);
                  const isHighRisk = (item.forgettingRisk || 0) >= 0.5;

                  return (
                    <div
                      key={item.conceptId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs hover:border-ink-200 transition"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-ink-400">
                            Course: <strong className="text-ink-700">{item.courseTitle}</strong>
                          </span>
                          {isHighRisk ? (
                            <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              High Forgetting Risk
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              Due for Review
                            </span>
                          )}
                        </div>
                        <h3 className="font-display font-bold text-ink-900 text-lg">{item.conceptName}</h3>
                        <div className="flex items-center gap-3 text-xs text-ink-500">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(5, masteryPct)}%`,
                                backgroundColor: masteryPct >= 80 ? "#10b981" : masteryPct >= 50 ? "#f59e0b" : "#6366f1",
                              }}
                            />
                          </div>
                          <span className="font-medium">{masteryPct}% mastery</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={`/adaptive-study?course=${item.courseId}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper hover:bg-ink-800 transition shadow-xs"
                        >
                          <span>Practice in Adaptive Study</span>
                          <span>→</span>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* FLASHCARDS TAB */}
      {activeTab === "flashcards" && (
        <section className="mt-8 space-y-6">
          {/* Subject Filter Pills */}
          <div className="flex flex-wrap justify-center gap-1.5">
            <button
              onClick={() => setSubject("All subjects")}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                subject === "All subjects"
                  ? "bg-ink-900 text-paper shadow-xs"
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 shadow-2xs"
              }`}
            >
              All subjects
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                  subject === s
                    ? "bg-ink-900 text-paper shadow-xs"
                    : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 shadow-2xs"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <p className="mt-3 text-xs text-ink-400">Loading flashcards…</p>
            </div>
          ) : !card ? (
            <div className="rounded-3xl border border-dashed border-ink-200 bg-white/70 p-8 text-center sm:p-12 shadow-xs">
              <span className="text-4xl">✨</span>
              <h2 className="mt-3 font-display text-lg font-bold text-ink-900">
                {reviewedCount > 0 ? "Review Session Complete!" : "Nothing due for review"}
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500 leading-relaxed">
                {reviewedCount > 0
                  ? `Outstanding! You reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"} in this session. Memory retention boosted.`
                  : "No flashcards are currently scheduled for review in this category."}
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <Link
                  to="/dashboard"
                  className="rounded-full bg-ink-900 px-5 py-2.5 text-xs font-semibold text-paper hover:bg-ink-800 transition shadow-xs"
                >
                  Return to Dashboard
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveTab("concepts")}
                  className="rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition shadow-2xs"
                >
                  Check Concepts Due
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Queue Status Tracker */}
              <div className="flex items-center justify-between rounded-2xl border border-ink-100 bg-white/80 px-4 py-2.5 text-xs shadow-2xs">
                <span className="font-semibold text-ink-700">
                  {remaining} card{remaining === 1 ? "" : "s"} left · <span className="text-ink-400 font-normal">{card.subject}</span>
                </span>
                <span className="font-medium text-emerald-700">
                  {reviewedCount} reviewed this session
                </span>
              </div>

              {/* 3D Tactile Card */}
              <TactileFlashcard
                front={card.front}
                back={card.back}
                subject={card.subject}
                flipped={flipped}
                onFlip={() => setFlipped((f) => !f)}
                cardIndex={index}
                totalCards={queue ? queue.length : undefined}
              />

              {/* SM-2 Recall Quality Buttons */}
              {flipped ? (
                <div className="space-y-3">
                  <p className="text-center text-xs font-medium text-ink-500">
                    How well did you recall this answer?
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 max-w-xl mx-auto">
                    {RATINGS.map((r) => (
                      <button
                        key={r.label}
                        type="button"
                        onClick={() => rate(r.quality)}
                        disabled={rating}
                        className={`group flex items-center justify-center gap-2 rounded-2xl py-3 px-3 text-xs font-bold transition disabled:opacity-50 ${r.className}`}
                      >
                        <kbd className="rounded bg-black/20 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
                          {r.key}
                        </kbd>
                        <span>{r.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-ink-400">
                  <span>Press</span>
                  <kbd className="rounded border border-ink-200 bg-ink-50 px-2 py-0.5 font-mono text-[10px] text-ink-600">
                    Space
                  </kbd>
                  <span>or click the card to reveal answer</span>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
