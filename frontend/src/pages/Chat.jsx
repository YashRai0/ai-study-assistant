import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import VoiceInput from "../components/VoiceInput.jsx";
import { speak, speechSupported } from "../utils/speech.js";

const SUGGESTIONS = [
  "Summarize the main idea of this chapter",
  "Explain the hardest concept here simply",
  "What are the key terms I should know?",
];

export default function Chat() {
  const { pdfId } = useParams();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    client.get(`/chat/${pdfId}/history`).then(({ data }) => setMessages(data.history || []));
  }, [pdfId]);

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
    // arrive, instead of a single "Thinking..." indicator that's replaced
    // all at once when the full answer comes back.
    setMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);

    try {
      const full = await streamChatRequest(`/chat/${pdfId}`, { message }, {
        onToken: (_token, accumulated) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated };
            return updated;
          });
        },
      });
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
    }
  }

  async function clearChat() {
    await client.delete(`/chat/${pdfId}/history`);
    setMessages([]);
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col px-6 py-8" style={{ minHeight: "calc(100vh - 72px)" }}>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Chat with your notes</h1>
        <div className="flex items-center gap-4">
          {speechSupported() && (
            <label className="flex items-center gap-2 text-sm text-ink-400">
              <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
              Read answers aloud
            </label>
          )}
          <button onClick={clearChat} className="text-sm text-ink-400 hover:text-ink-900">
            Clear chat
          </button>
        </div>
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
          placeholder="Ask a question about your notes, or tap 🎤 to speak…"
          className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-3 outline-none focus:border-highlight"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded-full bg-ink-900 px-6 py-3 text-paper disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </main>
  );
}
