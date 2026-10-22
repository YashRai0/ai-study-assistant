export default function CitationDrawer({ citation, onClose }) {
  if (!citation) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Citation Preview"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-ink-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-base">
              📄
            </span>
            <div>
              <h3 className="font-display text-sm font-bold text-ink-900">
                {citation.filename || "Source Document"}
              </h3>
              <p className="text-[11px] text-ink-500">
                Page {citation.page} {citation.score ? `· ${citation.score}% Retrieval Fit` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content Excerpt */}
        <div className="mt-4 space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
            Retrieved Context Excerpt
          </span>
          <blockquote className="max-h-60 overflow-y-auto rounded-xl border border-ink-100 bg-ink-50/50 p-4 font-mono text-xs leading-relaxed text-ink-800">
            {citation.excerpt || citation.text || citation.chunkText || (
              <span className="text-ink-400 italic">No direct excerpt text available for this chunk.</span>
            )}
          </blockquote>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between border-t border-ink-100/70 pt-3 text-xs text-ink-500">
          <span>Verified reference chunk</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-ink-900 px-4 py-1.5 font-semibold text-paper hover:bg-ink-800 transition shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
