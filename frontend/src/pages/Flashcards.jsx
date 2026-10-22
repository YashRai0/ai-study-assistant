import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client.js";
import StudyFlowNav from "../components/StudyFlowNav.jsx";
import TactileFlashcard from "../components/TactileFlashcard.jsx";
import { speak, speechSupported } from "../utils/speech.js";
import {
  exportDeckToCsv,
  exportDeckToJson,
  calculateDeckRetentionMetrics,
  filterCardsByQuery
} from "../utils/deckHelpers.js";

export default function Flashcards() {
  const { pdfId } = useParams();
  const [cards, setCards] = useState([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSaved, setCheckingSaved] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportNotice, setExportNotice] = useState("");

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

  // Filtered cards based on search query
  const filteredCards = useMemo(() => filterCardsByQuery(cards, searchQuery), [cards, searchQuery]);
  const metrics = useMemo(() => calculateDeckRetentionMetrics(cards), [cards]);

  const handleNext = useCallback(() => {
    if (index < filteredCards.length - 1) {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }, [index, filteredCards.length]);

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

  // Export functions
  function handleExportCsv() {
    if (!cards.length) return;
    const csvContent = exportDeckToCsv(cards);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prepnexia-deck-${pdfId || "notes"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice("Exported to CSV (Anki compatible) ✓");
    setTimeout(() => setExportNotice(""), 3000);
  }

  function handleExportJson() {
    if (!cards.length) return;
    const jsonContent = exportDeckToJson(cards, `Deck ${pdfId}`);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prepnexia-deck-${pdfId || "notes"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportNotice("Exported to JSON ✓");
    setTimeout(() => setExportNotice(""), 3000);
  }

  const currentCard = filteredCards[index] || null;
  const progressPct = filteredCards.length > 0 ? Math.round(((index + 1) / filteredCards.length) * 100) : 0;
  const isLastCard = index === filteredCards.length - 1;

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
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      {/* Document Navigation */}
      <div className="flex justify-center sm:justify-start">
        <StudyFlowNav pdfId={pdfId} current="flashcards" />
      </div>

      {/* Header */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-0.5 text-xs font-semibold text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
              Active Recall Deck
            </span>
            <span className="text-xs text-ink-400">~{metrics.estimatedMinutes} min review</span>
          </div>

          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">
            Interactive Flashcards
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-ink-500">
            Saved and scheduled for spaced review. Check{" "}
            <Link to="/review" className="font-semibold text-indigo-600 underline hover:text-indigo-800">
              Spaced Review
            </Link>{" "}
            to practice due cards across all courses.
          </p>
        </div>

        {/* Deck Management Actions */}
        {cards.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
              title="Export as CSV for Anki or Quizlet"
            >
              📥 Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="rounded-xl border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
              title="Export as JSON"
            >
              📦 JSON
            </button>
          </div>
        )}
      </div>

      {exportNotice && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 animate-in fade-in">
          {exportNotice}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-ink-200 bg-white/60 p-10 text-center shadow-xs">
          <span className="text-4xl">🃏</span>
          <h2 className="mt-3 font-display text-lg font-bold text-ink-900">No flashcards generated yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-500">
            Synthesize high-yield question-and-answer pairs directly from this document.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-ink-900 px-6 py-3 text-sm font-semibold text-paper shadow hover:bg-ink-800 transition disabled:opacity-50"
          >
            <span>{loading ? "Synthesizing cards…" : "Generate 15 Flashcards ✨"}</span>
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Deck Search and Filter Bar */}
          <div className="flex flex-col gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2 w-32 sm:w-44 overflow-hidden rounded-full bg-ink-100">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs font-bold text-ink-700">
                Card {filteredCards.length > 0 ? index + 1 : 0} of {filteredCards.length} ({progressPct}%)
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Card Filter Input */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIndex(0);
                }}
                placeholder="Filter cards…"
                className="rounded-xl border border-ink-200 bg-paper px-3 py-1 text-xs text-ink-900 focus:border-indigo-600 focus:outline-none"
              />

              <button
                type="button"
                onClick={shuffleDeck}
                className="inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white px-3 py-1 font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition"
                title="Shuffle card order"
              >
                <span>🔀</span>
                <span>Shuffle</span>
              </button>

              <button
                type="button"
                onClick={generate}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white px-3 py-1 font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 transition disabled:opacity-50"
                title="Generate 15 more flashcards"
              >
                <span>✨</span>
                <span>{loading ? "Adding…" : "Add 15"}</span>
              </button>
            </div>
          </div>

          {currentCard ? (
            <>
              {/* 3D Tactile Card View */}
              <div className="relative">
                <TactileFlashcard
                  front={currentCard.front}
                  back={currentCard.back}
                  subject={currentCard.subject}
                  flipped={flipped}
                  onFlip={toggleFlip}
                  cardIndex={index}
                  totalCards={filteredCards.length}
                />

                {/* Speech Synthesis Voice Button */}
                {speechSupported() && (
                  <button
                    type="button"
                    onClick={() => speak(flipped ? currentCard.back : currentCard.front)}
                    className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm border border-ink-100 hover:bg-white text-ink-700 transition"
                    title={flipped ? "Read answer aloud" : "Read question aloud"}
                  >
                    🔊
                  </button>
                )}
              </div>

              {/* Navigation Controls */}
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={index === 0}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-xs font-bold text-ink-800 shadow-2xs hover:bg-ink-50 transition disabled:opacity-30 disabled:hover:bg-white"
                  >
                    <span>←</span>
                    <span>Previous</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFlip}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-5 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition shadow-2xs"
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
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                    >
                      <span>🎉</span>
                      <span>Restart Deck</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900 px-5 py-2.5 text-xs font-bold text-paper shadow-xs hover:bg-ink-800 transition"
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
            </>
          ) : (
            <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center text-xs text-ink-500">
              No flashcards match your filter "{searchQuery}".
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="ml-2 font-semibold text-indigo-600 underline"
              >
                Clear filter
              </button>
            </div>
          )}
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
