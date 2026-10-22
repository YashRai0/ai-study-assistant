import { useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client.js";
import StudyFlowNav from "../components/StudyFlowNav.jsx";
import AudioPlayer from "../components/AudioPlayer.jsx";

const STYLES = [
  { id: "bullets", label: "Bullet points" },
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "exam", label: "Exam notes" },
];

export default function Summary() {
  const { pdfId } = useParams();
  const [style, setStyle] = useState("bullets");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post(`/summary/${pdfId}`, { style });
      setSummary(data.summary);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't generate a summary. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <StudyFlowNav pdfId={pdfId} current="summary" />
      <h1 className="mt-6 font-display text-2xl font-semibold text-ink-900">Summarize your notes</h1>
      <p className="mt-1 text-sm text-ink-600">
        Extract essential concepts, high-yield exam takeaways, or listen to an audio synthesis.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              style === s.id ? "bg-ink-900 text-paper shadow-sm" : "border border-ink-100 text-ink-600 hover:bg-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? (
          <>
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-ink-900 border-t-transparent" />
            <span>Generating…</span>
          </>
        ) : (
          <span>Generate summary</span>
        )}
      </button>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {summary && (
        <div className="mt-8 space-y-6">
          <AudioPlayer
            text={summary}
            title="Audio Lecture & Key Takeaways"
          />

          <article className="whitespace-pre-wrap rounded-3xl border border-ink-100 bg-white/80 p-6 text-ink-900 shadow-sm leading-relaxed">
            {summary}
          </article>
        </div>
      )}
    </main>
  );
}
