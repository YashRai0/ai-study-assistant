import { useEffect, useRef, useState } from "react";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import VoiceInput from "../components/VoiceInput.jsx";
import { speak, speechSupported } from "../utils/speech.js";

const ALL_SCOPE = "All subjects";

const SUGGESTIONS = [
  "What topics show up across all my notes?",
  "Compare how two of my subjects define the same term",
  "What should I review first before my exams?",
];

export default function MultiChat() {
  const [subjects, setSubjects] = useState([]);
  const [scope, setScope] = useState(ALL_SCOPE);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    client
      .get("/search/subjects")
      .then(({ data }) => setSubjects(data.subjects))
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    client
      .get("/multi-chat/history", { params: { scope } })
      .then(({ data }) => setMessages(data.history || []));
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

    // A placeholder assistant message that fills in progressively as tokens
    // arrive, instead of a single "Thinking..." indicator replaced all at
    // once when the full answer comes back.
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
          <h1 className="font-display text-2xl font-semibold text-ink-900">Chat across all your notes</h1>
          <p className="text-sm text-ink-400">Answers are drawn from every PDF in the scope below, not just one.</p>
        </div>
        <button onClick={clearChat} className="self-start text-sm text-ink-400 hover:text-ink-900 sm:self-auto">
          Clear chat
        </button>
      </div>

      {speechSupported() && (
        <label className="mt-2 flex items-center gap-2 text-sm text-ink-400">
          <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
          Read answers aloud
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setScope(ALL_SCOPE)}
          className={`rounded-full px-4 py-2 text-sm ${
            scope === ALL_SCOPE ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
          }`}
        >
          All subjects
        </button>
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={`rounded-full px-4 py-2 text-sm ${
              scope === s ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-6 flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-ink-100 px-4 py-2 text-sm text-ink-600 hover:border-highlight"
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
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 ${
                m.role === "user" ? "ml-auto bg-ink-900 text-paper" : "bg-white/80 text-ink-900"
              }`}
            >
              {m.content || (isStreamingPlaceholder ? "Thinking…" : "")}
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
    </main>
  );
}