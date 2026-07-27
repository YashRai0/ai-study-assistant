import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client.js";

export default function Flashcards() {
  const { pdfId } = useParams();
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .get(`/flashcards/${pdfId}`)
      .then(({ data }) => setCards(data.flashcards || []))
      .catch(() => {})
      .finally(() => setCheckingSaved(false));
  }, [pdfId]);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post(`/flashcards/${pdfId}`, { count: 15 });
      setCards(data.flashcards || []);
      setIndex(0);
      setFlipped(false);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't generate flashcards. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const card = cards[index];

  if (checkingSaved) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="text-ink-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Flashcards</h1>
      <p className="mt-2 text-sm text-ink-400">
        These are saved and scheduled for spaced-repetition review — check{" "}
        <Link to="/review" className="underline">Review</Link> to study due cards across all your notes.
      </p>

      {cards.length === 0 ? (
        <button
          onClick={generate}
          disabled={loading}
          className="mt-8 rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate 15 flashcards"}
        </button>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-400">
            Card {index + 1} of {cards.length}
          </p>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="mx-auto mt-4 flex min-h-[220px] w-full items-center justify-center rounded-2xl border border-ink-100 bg-white/80 p-8 font-display text-xl text-ink-900"
          >
            {flipped ? card.back : card.front}
          </button>
          <p className="mt-2 text-sm text-ink-400">Tap the card to flip it</p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => {
                setIndex((i) => Math.max(0, i - 1));
                setFlipped(false);
              }}
              className="rounded-full border border-ink-900 px-5 py-2 text-ink-900"
            >
              Previous
            </button>
            <button
              onClick={() => {
                setIndex((i) => Math.min(cards.length - 1, i + 1));
                setFlipped(false);
              }}
              className="rounded-full bg-ink-900 px-5 py-2 text-paper"
            >
              Next
            </button>
          </div>
          <button
            onClick={generate}
            disabled={loading}
            className="mt-6 text-sm text-ink-400 underline disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate 15 more"}
          </button>
        </>
      )}
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  );
}
