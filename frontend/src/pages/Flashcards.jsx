import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client.js";
import StudyFlowNav from "../components/StudyFlowNav.jsx";
import TactileFlashcard from "../components/TactileFlashcard.jsx";

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

  const handleNext = useCallback(() => {
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }, [index, cards.length]);

  const handlePrev = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
      setFlipped(false);
    }
  }, [index]);

  const toggleFlip = useCallback(() => {
    setFlipped((f) => !f);
  }, []);

  const shuffleDeck = () => {
    if (!cards.length) return;
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setIndex(0);
    setFlipped(false);
  };

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e) {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;

      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggleFlip();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        handlePrev();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleFlip, handleNext, handlePrev]);

  const card = cards[index];
  const progressPct = cards.length > 0 ? Math.round(((index + 1) / cards.length) * 100) : 0;
  const isLastCard = index === cards.length - 1;

  if (checkingSaved) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center">
        <div className="flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm text-ink-400">Loading flashcards…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* Document Navigation */}
      <div className="flex justify-center sm:justify-start">
        <StudyFlowNav pdfId={pdfId} current="flashcards" />
      </div>

      {/* Header */}
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
          Active Recall Deck
        </span>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-ink-900">
          Flashcard Deck
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Saved and scheduled for spaced retention. Check{" "}
          <Link to="/review" className="font-semibold text-indigo-600 underline hover:text-indigo-800">
            Review
          </Link>{" "}
          to practice due cards across all your sources.
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-ink-200 bg-white/60 p-10 text-center shadow-xs">
          <span className="text-4xl">🃏</span>
          <h2 className="mt-3 font-display text-lg font-bold text-ink-900">No flashcards generated yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
            AI can synthesize high-yield question-and-answer pairs directly from this document.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow hover:bg-ink-800 transition disabled:opacity-50"
          >
            <span>{loading ? "Synthesizing cards…" : "Generate 15 Flashcards ✨"}</span>
          </button>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          {/* Progress & Deck Tools Bar */}
          <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white/80 p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-32 sm:w-44 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink-700">
                Card {index + 1} of {cards.length} ({progressPct}%)
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={shuffleDeck}
                className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
                title="Shuffle card order"
              >
                <span>🔀</span>
                <span>Shuffle</span>
              </button>
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white px-3 py-1 font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition disabled:opacity-50"
                title="Generate 15 more flashcards"
              >
                <span>✨</span>
                <span>{loading ? "Adding…" : "Add 15"}</span>
              </button>
            </div>
          </div>

          {/* 3D Tactile Card View */}
          <TactileFlashcard
            front={card.front}
            back={card.back}
            subject={card.subject}
            flipped={flipped}
            onFlip={toggleFlip}
            cardIndex={index}
            totalCards={cards.length}
          />

          {/* Navigation Controls */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrev}
                disabled={index === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-5 py-2.5 text-xs font-bold text-ink-800 shadow-2xs hover:bg-ink-50 transition disabled:opacity-30 disabled:hover:bg-white"
              >
                <span>←</span>
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={toggleFlip}
                className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
              >
                <span>↻</span>
                <span>{flipped ? "Show Question" : "Reveal Answer"}</span>
              </button>

              {isLastCard ? (
                <button
                  type="button"
                  onClick={() => {
                    setIndex(0);
                    setFlipped(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                >
                  <span>🎉</span>
                  <span>Restart Deck</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-5 py-2.5 text-xs font-bold text-paper shadow-xs hover:bg-ink-800 transition"
                >
                  <span>Next</span>
                  <span>→</span>
                </button>
              )}
            </div>

            {/* Keyboard Shortcuts Hint Bar */}
            <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-ink-400">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
                  Space
                </kbd>{" "}
                Flip
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
                  ←
                </kbd>
                <kbd className="rounded border border-ink-200 bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
                  →
                </kbd>{" "}
                Navigate
              </span>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-xs font-semibold text-red-700">
          {error}
        </div>
      )}
    </main>
  );
}
