import { useEffect, useState } from "react";
import client from "../api/client.js";
import VoiceInput from "./VoiceInput.jsx";
import { speak, stopSpeaking, speechSupported } from "../utils/speech.js";

const STRATEGY_LABEL = {
  misconception_confrontation: "Fixing a misconception",
  direct_instruction: "Explanation",
  socratic_probe: "Think it through",
  worked_example: "Worked example",
  test_transfer: "Apply it",
};

export default function TutorIntervention({ courseId, conceptId, onClose }) {
  const [history, setHistory] = useState([]); // [{ strategy, outcome }]
  const [current, setCurrent] = useState(null); // { strategy, content, question, reason, interactionId }
  const [answer, setAnswer] = useState("");
  const [confidence, setConfidence] = useState(3);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [readAloud, setReadAloud] = useState(false);

  async function loadNext(priorInterventions) {
    setLoading(true);
    setError("");
    setResult(null);
    setAnswer("");
    try {
      const { data } = await client.post(
        `/learning/courses/${courseId}/concepts/${conceptId}/tutor/next`,
        { priorInterventions }
      );
      // data.interactionId identifies the question the server just
      // persisted — /tutor/respond grades against that stored copy, not
      // whatever this component sends back, so there's no client-supplied
      // idempotency key to manage here anymore.
      setCurrent(data);
      if (readAloud && data.content) speak(data.content);
    } catch {
      setError("Couldn't load the next step. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadNext([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopSpeaking(), []); // stop any speech when this modal unmounts

  async function submit() {
    if (!current?.question || !current?.interactionId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data } = await client.post(
        `/learning/courses/${courseId}/concepts/${conceptId}/tutor/respond`,
        { interactionId: current.interactionId, answer, confidence }
      );
      setResult(data);
      const nextHistory = [...history, { strategy: current.strategy, outcome: data.outcome }];
      setHistory(nextHistory);
    } catch {
      setError("Couldn't record that response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-black/50 p-4 md:p-0">
      <div className="mx-auto mt-8 max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            {current ? STRATEGY_LABEL[current.strategy] || "Tutor" : "Tutor"}
          </h2>
          <div className="flex items-center gap-3">
            {speechSupported() && (
              <label className="flex items-center gap-1 text-xs text-ink-500">
                <input
                  type="checkbox"
                  checked={readAloud}
                  onChange={(e) => {
                    setReadAloud(e.target.checked);
                    if (!e.target.checked) stopSpeaking();
                    else if (current?.content) speak(current.content);
                  }}
                />
                Read aloud
              </label>
            )}
            <button onClick={onClose} className="text-ink-400 hover:text-ink-900">✕</button>
          </div>
        </div>

        {loading ? (
          <p className="mt-6 text-ink-400">Thinking…</p>
        ) : error && !current ? (
          <p className="mt-6 text-red-600">{error}</p>
        ) : current ? (
          <div className="mt-4 max-h-[28rem] overflow-y-auto">
            <p className="whitespace-pre-wrap text-ink-700">{current.content}</p>

            {result ? (
              <section className={`mt-5 rounded-2xl border p-4 ${result.outcome === "success" ? "border-green-300 bg-green-50" : result.outcome === "partial" ? "border-amber-300 bg-amber-50" : "border-red-300 bg-red-50"}`}>
                <p className="font-semibold text-ink-900 capitalize">{result.outcome}</p>
                {result.evaluation?.misconception && <p className="mt-2 text-sm text-ink-600">{result.evaluation.misconception}</p>}
                <button
                  onClick={() => loadNext([...history])}
                  className="mt-4 rounded-full bg-ink-900 px-5 py-2 text-paper"
                >
                  Continue
                </button>
              </section>
            ) : current.question ? (
              <div className="mt-5">
                <p className="font-medium text-ink-900">{current.question}</p>
                <div className="mt-3 flex gap-2">
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="min-h-24 flex-1 rounded-xl border border-ink-100 p-3"
                    placeholder="Your answer, or tap 🎤 to speak it…"
                  />
                  <VoiceInput
                    disabled={submitting}
                    onTranscribed={(text) => {
                      setVoiceError("");
                      setAnswer((prev) => (prev ? `${prev} ${text}` : text));
                    }}
                    onError={setVoiceError}
                  />
                </div>
                {voiceError && <p className="mt-1 text-xs text-red-600">{voiceError}</p>}
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-sm">Confidence</label>
                  <select value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="rounded-lg border p-2">
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}/5</option>)}
                  </select>
                </div>
                <button
                  disabled={!answer || submitting}
                  onClick={submit}
                  className="mt-4 rounded-full bg-ink-900 px-5 py-2 text-paper disabled:opacity-40"
                >
                  {submitting ? "Checking…" : "Submit"}
                </button>
              </div>
            ) : (
              <button onClick={onClose} className="mt-6 rounded-full bg-ink-900 px-5 py-2 text-paper">Got it</button>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
