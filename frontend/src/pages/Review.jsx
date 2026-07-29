import { useEffect, useState } from "react";
import client from "../api/client.js";

const RATINGS = [
  { label: "Again", quality: 0, className: "bg-red-600 text-white" },
  { label: "Hard", quality: 3, className: "border border-ink-900 text-ink-900" },
  { label: "Good", quality: 4, className: "bg-ink-900 text-paper" },
  { label: "Easy", quality: 5, className: "bg-sage text-white" },
];

export default function Review() {
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
  }, []);

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject]);

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

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Review</h1>
      <p className="mt-2 text-sm text-ink-600">
        Cards due today, across all your notes — rate how well you remembered each one.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
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
        <p className="mt-8 text-ink-400">Loading…</p>
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
            className="mx-auto mt-4 flex min-h-[220px] w-full items-center justify-center rounded-2xl border border-ink-100 bg-white/80 p-8 font-display text-xl text-ink-900"
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
                  className={`rounded-full px-3 py-3 text-sm font-medium disabled:opacity-50 ${r.className}`}
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
    </main>
  );
}