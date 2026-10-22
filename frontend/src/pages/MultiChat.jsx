import { useEffect, useRef, useState } from "react";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import VoiceInput from "../components/VoiceInput.jsx";
import CitationDrawer from "../components/CitationDrawer.jsx";
import { speak, speechSupported } from "../utils/speech.js";

const ALL_SCOPE = "All subjects";

const SUGGESTIONS = [
  "What are the recurring themes across my notes?",
  "How do the concepts in my different documents connect?",
  "Give me a study guide covering everything I've uploaded",
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
    client.get("/search/subjects").then(({ data }) => setSubjects(data.subjects)).catch(() => setSubjects([]));
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
    await client.delete("/multi-chat/history", { params: { scope } });
    setMessages([]);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-6 py-8" style={{ minHeight: "calc(100vh - 72px)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Chat across all your notes</h1>
          <p className="text-xs text-ink-500">Cross-document synthesis querying every source in the active scope.</p>
        </div>
        <button onClick={clearChat} className="self-start text-xs text-ink-400 hover:text-ink-900 sm:self-auto transition">
          Clear chat
        </button>
      </div>

      {speechSupported() && (
        <label className="mt-2 flex items-center gap-2 text-xs text-ink-500">
          <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
          Read answers aloud
        </label>
      )}

      {/* Scope Filter Pills */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setScope(ALL_SCOPE)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            scope === ALL_SCOPE
              ? "bg-ink-900 text-paper shadow-2xs"
              : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 shadow-2xs"
          }`}
        >
          All subjects
        </button>
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              scope === s
                ? "bg-ink-900 text-paper shadow-2xs"
                : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50 shadow-2xs"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Chat Messages */}
      <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-ink-200 bg-white px-4 py-2 text-xs font-medium text-ink-700 hover:border-indigo-400 hover:bg-indigo-50/50 shadow-2xs transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => {
          const isStreamingPlaceholder = sending && i === messages.length - 1 && m.role === "assistant";
          return (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 shadow-2xs ${
                m.role === "user" ? "ml-auto bg-ink-900 text-paper" : "bg-white/90 text-ink-900 border border-ink-100/70"
              }`}
            >
              <div>{m.content || (isStreamingPlaceholder ? "Thinking…" : "")}</div>
              {m.role === "assistant" && !isStreamingPlaceholder && (m.sources?.length > 0 || m.confidence) && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-ink-100/70 pt-2 text-xs">
                  {m.confidence === "HIGH" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Verified in Notes
                    </span>
                  )}
                  {m.confidence === "MEDIUM" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Partial Match
                    </span>
                  )}
                  {m.confidence === "LOW" && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 font-medium text-ink-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
                      General Knowledge
                    </span>
                  )}
                  {m.sources?.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveCitation(s)}
                      className="inline-flex items-center gap-1 rounded-md border border-ink-200 bg-paper/90 px-2 py-0.5 text-ink-700 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-900 transition shadow-2xs cursor-pointer"
                      title={s.filename ? `From ${s.filename}` : "Click to view verified source chunk quote"}
                    >
                      <span>📚 {s.filename ? `${s.filename.slice(0, 14)}…` : "Doc"} p.{s.page}</span>
                      {s.score && <span className="text-[10px] text-ink-400 font-normal">({s.score}%)</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {voiceError && <p className="mt-2 text-sm text-red-600">{voiceError}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-6 flex gap-2"
      >
        <VoiceInput
          disabled={sending}
          onTranscribed={(text) => {
            setVoiceError("");
            send(text);
          }}
          onError={setVoiceError}
        />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask something about ${scope === ALL_SCOPE ? "all your notes" : scope}, or tap 🎤…`}
          className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-3 outline-none focus:border-highlight"
        />
        <button
          type={sending ? "button" : "submit"}
          onClick={sending ? stopGenerating : undefined}
          className="rounded-full bg-ink-900 px-6 py-3 text-paper"
        >
          {sending ? "Stop" : "Send"}
        </button>
      </form>

      {/* Interactive Citation Inspection Modal */}
      {activeCitation && (
        <CitationDrawer
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </main>
  );
}
