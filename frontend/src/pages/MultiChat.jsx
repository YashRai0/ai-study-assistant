import { useEffect, useRef, useState } from "react";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import VoiceInput from "../components/VoiceInput.jsx";
import CitationDrawer from "../components/CitationDrawer.jsx";
import { speak, speechSupported } from "../utils/speech.js";
import Badge from "../components/ui/Badge.jsx";
import Button from "../components/ui/Button.jsx";

const ALL_SCOPE = "All subjects";

const SUGGESTIONS = [
  "What are the recurring themes across my notes?",
  "How do the concepts in my different documents connect?",
  "Give me a high-yield study guide covering all uploaded materials",
];

export default function MultiChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [scope, setScope] = useState(ALL_SCOPE);
  const [voiceError, setVoiceError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    client.get("/search/subjects").then(({ data }) => setSubjects(data.subjects || [])).catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    client
      .get("/multi-chat/history", { params: { scope } })
      .then(({ data }) => setMessages(data.history || []))
      .catch(() => setMessages([]));
  }, [scope]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: message, ts: Date.now() }]);
    setInput("");
    setSending(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const full = await streamChatRequest(
        "/multi-chat",
        { message, scope },
        {
          signal: controller.signal,
          onToken: (_token, accumulated) => {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated };
              return updated;
            });
          },
          onMeta: (meta) => {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.role === "assistant") {
                updated[updated.length - 1] = {
                  ...last,
                  sources: meta.sources ?? last.sources,
                  confidence: meta.confidence ?? last.confidence,
                };
              }
              return updated;
            });
          },
        }
      );
      if (readAloud) speak(full);
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: err.message || "Something went wrong. Please try again.",
          ts: Date.now(),
        };
        return updated;
      });
    } finally {
      setSending(false);
      abortControllerRef.current = null;
    }
  }

  function stopGenerating() {
    abortControllerRef.current?.abort();
  }

  async function clearChat() {
    if (!window.confirm("Clear this multi-document conversation history?")) return;
    await client.delete("/multi-chat/history", { params: { scope } });
    setMessages([]);
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col px-4 py-8 sm:px-6 lg:px-8" style={{ minHeight: "calc(100vh - 72px)" }}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 dark:border-[#273352] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo" size="sm" dot>
              Cross-Document Synthesis
            </Badge>
            <span className="text-xs text-ink-400">Holistic Note Querying</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-ink-50 sm:text-3xl">
            Global Knowledge Assistant
          </h1>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Query across multiple textbooks, slides, and lectures simultaneously with verified citations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {speechSupported() && (
            <label className="flex items-center gap-2 rounded-lg border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] px-3 py-1.5 text-xs text-ink-600 dark:text-ink-300 cursor-pointer">
              <input
                type="checkbox"
                checked={readAloud}
                onChange={(e) => setReadAloud(e.target.checked)}
                className="h-3.5 w-3.5 rounded text-highlight"
              />
              <span>Read aloud</span>
            </label>
          )}
          <button
            onClick={clearChat}
            className="rounded-lg border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] px-3 py-1.5 text-xs font-medium text-ink-600 dark:text-ink-300 hover:text-red-600 transition"
          >
            Clear History
          </button>
        </div>
      </div>

      {/* Scope Filter Pills */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-400 mr-1">Scope:</span>
        <button
          onClick={() => setScope(ALL_SCOPE)}
          className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
            scope === ALL_SCOPE
              ? "bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950 shadow-2xs"
              : "border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] text-ink-600 dark:text-ink-300 hover:bg-ink-50"
          }`}
        >
          All subjects
        </button>
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-full px-3.5 py-1 text-xs font-semibold transition ${
              scope === s
                ? "bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950 shadow-2xs"
                : "border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] text-ink-600 dark:text-ink-300 hover:bg-ink-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat Messages Timeline */}
      <div className="mt-6 flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="mt-12 text-center">
            <span className="text-4xl">🌐</span>
            <h2 className="mt-3 font-display text-lg font-bold text-ink-900 dark:text-ink-100">
              Explore concepts across all your materials
            </h2>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400 max-w-md mx-auto">
              Ask broad questions to see how different subjects intersect, compare theories, or generate unified study guides.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] px-4 py-2 text-xs font-medium text-ink-700 dark:text-ink-300 hover:border-highlight hover:bg-highlight/5 shadow-2xs transition"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => {
          const isStreamingPlaceholder = sending && i === messages.length - 1 && m.role === "assistant";
          return (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-5 py-4 shadow-2xs transition ${
                m.role === "user"
                  ? "ml-auto bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950"
                  : "bg-white dark:bg-[#1b233a] text-ink-900 dark:text-ink-50 border border-ink-100 dark:border-[#273352]"
              }`}
            >
              <div className="leading-relaxed text-sm">
                {m.content || (isStreamingPlaceholder ? (
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-400">
                    <span className="h-2 w-2 rounded-full bg-highlight animate-ping" />
                    Synthesizing knowledge across notes…
                  </span>
                ) : "")}
              </div>

              {m.role === "assistant" && !isStreamingPlaceholder && (m.sources?.length > 0 || m.confidence) && (
                <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-ink-100 dark:border-[#273352] pt-2.5 text-xs">
                  {m.confidence === "HIGH" && (
                    <Badge variant="sage" size="sm" dot>
                      Verified in Notes
                    </Badge>
                  )}
                  {m.confidence === "MEDIUM" && (
                    <Badge variant="highlight" size="sm" dot>
                      Partial Match
                    </Badge>
                  )}
                  {m.confidence === "LOW" && (
                    <Badge variant="default" size="sm" dot>
                      General AI Knowledge
                    </Badge>
                  )}

                  {m.sources?.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveCitation(s)}
                      className="rounded-md bg-ink-50 dark:bg-[#131a2c] px-2 py-0.5 text-2xs font-semibold text-ink-600 dark:text-ink-300 hover:underline border border-ink-200/50 dark:border-[#273352]"
                    >
                      📄 {s.filename || "Doc"} {s.page ? `p. ${s.page}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Voice Error Display */}
      {voiceError && (
        <div className="mb-2 rounded-xl bg-red-50 dark:bg-red-950/40 p-2 text-center text-xs text-red-600 dark:text-red-300">
          {voiceError}
        </div>
      )}

      {/* Chat Input Console */}
      <div className="sticky bottom-0 bg-paper/90 dark:bg-ink-950/90 py-3 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 rounded-2xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#1b233a] p-1.5 shadow-sm"
        >
          <VoiceInput
            onTranscript={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))}
            onError={(msg) => setVoiceError(msg)}
          />

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sending ? "Assistant is thinking…" : "Ask a question across all your notes…"}
            disabled={sending}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-ink-900 dark:text-ink-50 outline-none placeholder:text-ink-400"
          />

          {sending ? (
            <Button
              variant="outline"
              size="sm"
              onClick={stopGenerating}
            >
              Stop ⏹
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!input.trim()}
            >
              Send ↑
            </Button>
          )}
        </form>
      </div>

      {/* Citation Detail Drawer */}
      <CitationDrawer
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </main>
  );
}
