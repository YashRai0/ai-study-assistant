import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";

const RATINGS = [
  { label: "Again", quality: 0, className: "bg-red-600 text-white" },
  { label: "Hard", quality: 3, className: "border border-ink-900 text-ink-900" },
  { label: "Good", quality: 4, className: "bg-ink-900 text-paper" },
  { label: "Easy", quality: 5, className: "bg-sage text-white" },
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

  async function rate(quality) {
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
  }

  const card = queue?.[index];
  const remaining = queue ? Math.max(queue.length - index, 0) : 0;
  const conceptDueCount = conceptQueue?.length ?? 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Spaced Review</h1>
        <p className="mt-2 text-sm text-ink-600">
          Strengthen memory retention before the forgetting curve sets in.
        </p>

        {/* Mode Selector */}
        <div className="mt-6 inline-flex rounded-full border border-ink-100 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("concepts")}
            className={`inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold transition ${
              activeTab === "concepts"
                ? "bg-ink-900 text-paper shadow"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <span>Concepts Due</span>
            {conceptDueCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                activeTab === "concepts" ? "bg-amber-400 text-ink-900" : "bg-amber-100 text-amber-800"
              }`}>
                {conceptDueCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("flashcards")}
            className={`rounded-full px-5 py-2 text-xs font-semibold transition ${
              activeTab === "flashcards"
                ? "bg-ink-900 text-paper shadow"
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
            <p className="text-center text-ink-400">Loading spaced review queue…</p>
          ) : !conceptQueue?.length ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-8 text-center sm:p-12">
              <span className="text-3xl">🎉</span>
              <h2 className="mt-3 font-display text-lg font-semibold text-emerald-950">
                You're all caught up on concept reviews!
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-emerald-700">
                No concepts are due for review right now. Keep exploring new material or practice flashcard decks.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("flashcards")}
                  className="rounded-full bg-ink-900 px-5 py-2 text-xs font-semibold text-paper hover:bg-ink-800 transition"
                >
                  Review Flashcards →
                </button>
                <Link
                  to="/dashboard"
                  className="rounded-full border border-ink-200 px-5 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition"
                >
                  Back to Dashboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-ink-500 px-1">
                <span>{conceptQueue.length} concept{conceptQueue.length === 1 ? "" : "s"} due for spaced retrieval</span>
                <span>Prioritized by forgetting risk</span>
              </div>

              <div className="grid gap-3">
                {conceptQueue.map((item) => {
                  const masteryPct = Math.round((item.mastery || 0) * 100);
                  const isHighRisk = (item.forgettingRisk || 0) >= 0.5;

                  return (
                    <div
                      key={item.conceptId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border border-ink-100 bg-white p-4 shadow-sm hover:border-ink-200 transition"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-ink-400">
                            Course: <strong className="text-ink-700">{item.courseTitle}</strong>
                          </span>
                          {isHighRisk ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                              High Forgetting Risk
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                              Due for Review
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-ink-900 text-base">{item.conceptName}</h3>
                        <div className="flex items-center gap-3 text-xs text-ink-500">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(5, masteryPct)}%`,
                                backgroundColor: masteryPct >= 80 ? "#10b981" : masteryPct >= 50 ? "#f59e0b" : "#6366f1",
                              }}
                            />
                          </div>
                          <span>{masteryPct}% mastery</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          to={`/adaptive-study?course=${item.courseId}`}
                          className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper hover:bg-ink-800 transition"
                        >
                          Practice in Adaptive Study →
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
        <section className="mt-8 text-center">
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setSubject("All subjects")}
              className={`rounded-full px-4 py-2 text-sm ${
                subject === "All subjects" ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
              }`}
            >
              All subjects
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => setSubject(s)}
                className={`rounded-full px-4 py-2 text-sm ${
                  subject === s ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="mt-8 text-ink-400">Loading flashcards…</p>
          ) : !card ? (
            <div className="mt-8 rounded-2xl border border-dashed border-ink-100 p-8 text-ink-400">
              {reviewedCount > 0
                ? `Nice work — you reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}. Nothing else due right now.`
                : "Nothing due for review right now — check back later, or generate flashcards from a PDF first."}
            </div>
          ) : (
            <>
              <p className="mt-6 text-sm text-ink-400">
                {remaining} card{remaining === 1 ? "" : "s"} left · {card.subject}
              </p>
              <button
                onClick={() => setFlipped((f) => !f)}
                className="mx-auto mt-4 flex min-h-[220px] w-full items-center justify-center rounded-2xl border border-ink-100 bg-white/80 p-8 font-display text-xl text-ink-900 cursor-pointer shadow-sm hover:border-ink-200 transition"
              >
                {flipped ? card.back : card.front}
              </button>
              <p className="mt-2 text-sm text-ink-400">
                {flipped ? "How well did you remember this?" : "Tap the card to reveal the answer"}
              </p>

              {flipped ? (
                <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RATINGS.map((r) => (
                    <button
                      key={r.label}
                      onClick={() => rate(r.quality)}
                      disabled={rating}
                      className={`rounded-full px-3 py-3 text-sm font-medium disabled:opacity-50 cursor-pointer ${r.className}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6 h-12" />
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}