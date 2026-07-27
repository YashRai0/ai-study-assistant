import { useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client.js";

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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Summarize your notes</h1>
      <div className="mt-6 flex flex-wrap gap-2">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            className={`rounded-full px-4 py-2 text-sm ${
              style === s.id ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        onClick={generate}
        disabled={loading}
        className="mt-6 rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 disabled:opacity-50"
      >
        {loading ? "Generating…" : "Generate summary"}
      </button>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {summary && (
        <article className="mt-8 whitespace-pre-wrap rounded-2xl border border-ink-100 bg-white/70 p-6 text-ink-900">
          {summary}
        </article>
      )}
    </main>
  );
}
