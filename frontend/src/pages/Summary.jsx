import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client.js";
import StudyFlowNav from "../components/StudyFlowNav.jsx";
import AudioPlayer from "../components/AudioPlayer.jsx";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";

const STYLES = [
  { id: "bullets", label: "Bullet points", icon: "•" },
  { id: "short", label: "Executive Short", icon: "⚡" },
  { id: "medium", label: "Comprehensive", icon: "📖" },
  { id: "exam", label: "High-Yield Exam Notes", icon: "🎯" },
];

export default function Summary() {
  const { pdfId } = useParams();
  const [style, setStyle] = useState("bullets");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

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

  function handleCopy() {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <StudyFlowNav pdfId={pdfId} current="summary" />

      {/* Header */}
      <div className="mt-6 flex flex-col gap-2 border-b border-ink-100 dark:border-[#273352] pb-6">
        <div className="flex items-center gap-2">
          <Badge variant="indigo" size="sm" dot>
            Knowledge Synthesis
          </Badge>
          <span className="text-xs text-ink-400">Multimodal Summarization</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-ink-50 sm:text-4xl">
          Summarize Study Material
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Extract high-yield concepts, structured takeaways, and generate audio syntheses grounded in your upload.
        </p>
      </div>

      {/* Synthesis Mode Selector */}
      <Card className="mt-8 p-6">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-400 mb-3">
          Select Synthesis Format
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition ${
                style === s.id
                  ? "border-highlight bg-highlight/15 dark:border-highlight/60 text-ink-950 dark:text-ink-50 shadow-xs"
                  : "border-ink-100 dark:border-[#273352] bg-white dark:bg-[#131a2c] text-ink-600 dark:text-ink-300 hover:border-ink-300 dark:hover:border-ink-700"
              }`}
            >
              <span className="text-base">{s.icon}</span>
              <span className="mt-1 text-xs font-bold">{s.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="primary"
            size="md"
            loading={loading}
            onClick={generate}
          >
            {summary ? "Regenerate Summary" : "Generate Summary"}
          </Button>
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
      </Card>

      {/* Generated Output */}
      {summary && (
        <div className="mt-8 space-y-6">
          <AudioPlayer
            text={summary}
            title="Audio Lecture & Spoken Summary"
          />

          <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between border-b border-ink-100 dark:border-[#273352] pb-4 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Extracted Synthesis
              </span>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-[#273352] bg-ink-50/70 dark:bg-[#131a2c] px-3 py-1 text-xs font-semibold text-ink-700 dark:text-ink-300 hover:bg-ink-100 transition"
              >
                {copied ? "✓ Copied!" : "📋 Copy notes"}
              </button>
            </div>

            <article className="prose prose-ink dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-sm text-ink-900 dark:text-ink-100">
              {summary}
            </article>

            {/* Downstream Practice Bridges */}
            <div className="mt-8 border-t border-ink-100 dark:border-[#273352] pt-6">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-400">
                Next Cognitive Actions
              </span>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link to={`/flashcards/${pdfId}`}>
                  <Button variant="secondary" size="sm">
                    🗂️ Convert to Flashcards
                  </Button>
                </Link>
                <Link to={`/quiz/${pdfId}`}>
                  <Button variant="outline" size="sm">
                    📝 Test Knowledge with Quiz
                  </Button>
                </Link>
                <Link to={`/chat/${pdfId}`}>
                  <Button variant="ghost" size="sm">
                    💬 Deep Dive in AI Chat
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
