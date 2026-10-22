export default function TactileFlashcard({
  front,
  back,
  subject,
  flipped,
  onFlip,
  cardIndex,
  totalCards,
}) {
  return (
    <div
      className="perspective-1000 mx-auto w-full max-w-xl cursor-pointer select-none"
      onClick={onFlip}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onFlip();
        }
      }}
      aria-label={flipped ? "Flashcard answer. Click or press space to flip back." : "Flashcard question. Click or press space to reveal answer."}
    >
      <div
        className={`transform-style-3d relative min-h-[320px] w-full rounded-3xl transition-transform duration-500 ease-out ${
          flipped ? "rotate-y-180" : ""
        }`}
      >
        {/* FRONT FACE */}
        <div className="backface-hidden absolute inset-0 flex flex-col justify-between rounded-3xl border border-ink-100/80 bg-gradient-to-b from-white via-white to-paper/40 p-7 sm:p-9 shadow-lg shadow-ink-900/5 hover:border-ink-200 transition-all">
          {/* Header */}
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50/70 px-3 py-1 font-semibold text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse" />
              QUESTION
            </span>
            <div className="flex items-center gap-2">
              {subject && (
                <span className="max-w-[140px] truncate rounded-full bg-ink-100/70 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
                  {subject}
                </span>
              )}
              {totalCards && (
                <span className="text-[11px] font-bold text-ink-400">
                  {cardIndex !== undefined ? cardIndex + 1 : 1}/{totalCards}
                </span>
              )}
            </div>
          </div>

          {/* Question Content */}
          <div className="my-auto py-6 text-center">
            <p className="font-display text-xl sm:text-2xl font-bold tracking-tight text-ink-900 leading-relaxed">
              {front}
            </p>
          </div>

          {/* Footer Hint */}
          <div className="flex items-center justify-center gap-2 text-xs text-ink-400">
            <kbd className="rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 font-mono text-[10px] text-ink-600 shadow-2xs">
              Space
            </kbd>
            <span>or click to reveal answer</span>
            <span aria-hidden="true">↻</span>
          </div>
        </div>

        {/* BACK FACE */}
        <div className="backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-between rounded-3xl border border-emerald-100/80 bg-gradient-to-b from-emerald-50/20 via-white to-white p-7 sm:p-9 shadow-lg shadow-emerald-900/5 transition-all">
          {/* Header */}
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              ANSWER
            </span>
            {totalCards && (
              <span className="text-[11px] font-bold text-ink-400">
                {cardIndex !== undefined ? cardIndex + 1 : 1}/{totalCards}
              </span>
            )}
          </div>

          {/* Answer Content */}
          <div className="my-auto py-6 text-center">
            <p className="text-base sm:text-lg font-medium text-ink-800 leading-relaxed">
              {back}
            </p>
          </div>

          {/* Footer Hint */}
          <div className="flex items-center justify-center gap-2 text-xs text-ink-400">
            <kbd className="rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 font-mono text-[10px] text-ink-600 shadow-2xs">
              Space
            </kbd>
            <span>or click to flip back</span>
          </div>
        </div>
      </div>
    </div>
  );
}
