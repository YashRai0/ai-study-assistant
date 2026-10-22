import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import VoiceInput from "../components/VoiceInput.jsx";
import StudyFlowNav from "../components/StudyFlowNav.jsx";
import CitationDrawer from "../components/CitationDrawer.jsx";
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
  const [actionError, setActionError] = useState("");
  const [readAloud, setReadAloud] = useState(false);
  const [explainMode, setExplainMode] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const [splitView, setSplitView] = useState(true);
  const [copiedCitation, setCopiedCitation] = useState(false);

  const bottomRef = useRef(null);
  const abortControllerRef = useRef(null);

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

    setMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const full = await streamChatRequest(
        `/chat/${pdfId}`,
        { message, mode: explainMode ? "explain" : "chat" },
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
                const nextSources = meta.sources ?? last.sources;
                if (nextSources?.length > 0 && !activeCitation) {
                  setActiveCitation(nextSources[0]);
                }
                updated[updated.length - 1] = {
                  ...last,
                  sources: nextSources,
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
    try {
      await client.delete(`/chat/${pdfId}/history`);
      setMessages([]);
      setActiveCitation(null);
    } catch {
      setActionError("Couldn't clear the chat right now. Please try again.");
    }
  }

  function quoteInChat(cit) {
    const quote = cit.excerpt || cit.text || "";
    setInput(`Regarding page ${cit.page}: "${quote.slice(0, 140)}..." Can you explain this further?`);
  }

  function copyCitationText(cit) {
    const text = cit.excerpt || cit.text || `Citation from page ${cit.page}`;
    navigator.clipboard?.writeText(text);
    setCopiedCitation(true);
    setTimeout(() => setCopiedCitation(false), 2000);
  }

  // Gather all unique cited sources across the entire chat conversation
  const allConversationSources = messages
    .filter((m) => m.role === "assistant" && m.sources?.length > 0)
    .flatMap((m) => m.sources);

  return (
    <main
      className={`mx-auto flex flex-col px-4 py-8 sm:px-6 transition-all ${
        splitView ? "max-w-7xl" : "max-w-3xl"
      }`}
      style={{ minHeight: "calc(100vh - 72px)" }}
    >
      <StudyFlowNav pdfId={pdfId} current="chat" />

      {/* Control Header */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">
            Document AI Tutor
          </h1>
          <p className="text-xs text-ink-500">
            Grounded strictly in your uploaded material with interactive citation tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Split Screen View Toggle */}
          <button
            type="button"
            onClick={() => setSplitView(!splitView)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              splitView
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-2xs"
                : "border-ink-200 bg-paper text-ink-600 hover:bg-white"
            }`}
          >
            <span>{splitView ? "📖 Split Canvas On" : "💬 Focus Chat"}</span>
          </button>

          <label className="flex items-center gap-1.5 text-xs font-medium text-ink-600 cursor-pointer">
            <input
              type="checkbox"
              checked={explainMode}
              onChange={(e) => setExplainMode(e.target.checked)}
              className="rounded"
            />
            Explain simply
          </label>

          {speechSupported() && (
            <label className="flex items-center gap-1.5 text-xs font-medium text-ink-600 cursor-pointer">
              <input
                type="checkbox"
                checked={readAloud}
                onChange={(e) => setReadAloud(e.target.checked)}
                className="rounded"
              />
              Read aloud
            </label>
          )}

          <button
            onClick={clearChat}
            className="text-xs font-medium text-ink-400 hover:text-ink-900 transition"
          >
            Clear chat
          </button>
        </div>
      </div>

      {/* Main Workspace (Split-Screen or Focus) */}
      <div className={`mt-6 flex flex-1 gap-6 ${splitView ? "flex-col lg:flex-row" : "flex-col"}`}>
        {/* Left Column: Chat Conversation Stream */}
        <div className="flex flex-1 flex-col justify-between space-y-4">
          <div className="space-y-4 overflow-y-auto max-h-[62vh] pr-1">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-6 text-center">
                <span className="text-3xl">💡</span>
                <h3 className="mt-2 text-sm font-bold text-ink-900">What would you like to explore?</h3>
                <p className="mt-1 text-xs text-ink-500">Pick a prompt starter or type any question below:</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-medium text-ink-700 shadow-2xs hover:border-indigo-400 hover:text-indigo-900 transition"
                    >
                      {s}
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
                  className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 shadow-2xs ${
                    m.role === "user"
                      ? "ml-auto bg-ink-900 text-paper font-medium"
                      : "bg-white text-ink-900 border border-ink-100"
                  }`}
                >
                  <div className="text-sm leading-relaxed">
                    {m.content || (isStreamingPlaceholder ? "Synthesizing answer from notes…" : "")}
                  </div>

                  {m.role === "assistant" && !isStreamingPlaceholder && (m.sources?.length > 0 || m.confidence) && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ink-100/80 pt-2 text-xs">
                      {m.confidence === "HIGH" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Verified
                        </span>
                      )}
                      {m.confidence === "MEDIUM" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 text-[11px]">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Partial
                        </span>
                      )}
                      {m.confidence === "LOW" && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 font-medium text-ink-600 text-[11px]">
                          General Knowledge
                        </span>
                      )}

                      {/* Source Citation Chips */}
                      {m.sources?.map((s, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setActiveCitation(s);
                            if (!splitView) setSplitView(true);
                          }}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer shadow-2xs ${
                            activeCitation?.page === s.page && activeCitation?.text === s.text
                              ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                              : "border-ink-200 bg-paper hover:bg-indigo-50/50 hover:text-indigo-800 text-ink-700"
                          }`}
                          title="View verified source chunk in canvas"
                        >
                          <span>📄 Page {s.page}</span>
                          {s.score && <span className="text-[10px] opacity-75">({s.score}%)</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {explainMode && (
            <p className="inline-block w-fit rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-semibold text-indigo-700">
              💡 Explain-simply mode active: using analogies and plain language.
            </p>
          )}

          {voiceError && <p className="text-xs font-semibold text-red-600">{voiceError}</p>}
          {actionError && <p className="text-xs font-semibold text-red-600">{actionError}</p>}

          {/* Prompt Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2"
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
              placeholder={
                explainMode
                  ? "Ask something to explain simply, or tap 🎤…"
                  : "Ask a question about this document, or tap 🎤…"
              }
              aria-label="Message"
              className="flex-1 rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-200 transition shadow-2xs"
            />

            <button
              type={sending ? "button" : "submit"}
              onClick={sending ? stopGenerating : undefined}
              className="rounded-2xl bg-ink-900 px-6 py-3 text-xs font-bold text-paper transition hover:bg-ink-800 shadow-xs"
            >
              {sending ? "Stop" : "Send →"}
            </button>
          </form>
        </div>

        {/* Right Column: Split Screen Document Citation Canvas */}
        {splitView && (
          <aside className="w-full lg:w-[420px] rounded-3xl border border-ink-100 bg-white p-5 shadow-sm flex flex-col justify-between">
            <div>
              {/* Canvas Header */}
              <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 text-sm">
                    📑
                  </span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-ink-900">
                      Citation Canvas
                    </h3>
                    <p className="text-[11px] text-ink-400">
                      {activeCitation ? `Page ${activeCitation.page} · Grounded Source` : "Source Inspector"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {activeCitation && (
                    <button
                      type="button"
                      onClick={() => copyCitationText(activeCitation)}
                      className="rounded-lg border border-ink-200 px-2 py-1 text-[11px] font-semibold text-ink-700 hover:bg-ink-50 transition"
                      title="Copy excerpt to clipboard"
                    >
                      {copiedCitation ? "Copied! ✓" : "Copy"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSplitView(false)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 transition"
                    title="Close split view"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Active Citation Card */}
              {activeCitation ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-bold text-indigo-700 text-[10px] uppercase tracking-wider">
                      Page {activeCitation.page} {activeCitation.score ? `· ${activeCitation.score}% Match` : ""}
                    </span>
                    {speechSupported() && (
                      <button
                        type="button"
                        onClick={() => speak(activeCitation.excerpt || activeCitation.text)}
                        className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                      >
                        🔊 Read excerpt
                      </button>
                    )}
                  </div>

                  <blockquote className="max-h-72 overflow-y-auto rounded-2xl border border-ink-100 bg-paper p-4 font-mono text-xs leading-relaxed text-ink-900 shadow-2xs">
                    {activeCitation.excerpt || activeCitation.text || activeCitation.chunkText || (
                      <span className="text-ink-400 italic">No direct excerpt text available.</span>
                    )}
                  </blockquote>

                  {/* Quote into prompt action */}
                  <button
                    type="button"
                    onClick={() => quoteInChat(activeCitation)}
                    className="w-full rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 text-center text-xs font-semibold text-indigo-800 hover:bg-indigo-100 transition shadow-2xs"
                  >
                    💬 Ask tutor to explain this excerpt
                  </button>
                </div>
              ) : (
                <div className="mt-8 rounded-2xl border border-dashed border-ink-200 bg-paper p-6 text-center">
                  <span className="text-2xl">🔍</span>
                  <h4 className="mt-2 text-xs font-bold text-ink-800">No active citation selected</h4>
                  <p className="mt-1 text-[11px] text-ink-400">
                    Click any "Page X" citation chip inside the chat responses to inspect the source passage here.
                  </p>
                </div>
              )}
            </div>

            {/* List of other cited sources in this session */}
            {allConversationSources.length > 1 && (
              <div className="mt-6 border-t border-ink-100 pt-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400">
                  Other Citations in this Thread ({allConversationSources.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {allConversationSources.map((cit, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveCitation(cit)}
                      className="rounded-lg border border-ink-200 bg-paper px-2 py-0.5 text-[10px] font-semibold text-ink-700 hover:bg-indigo-50 hover:text-indigo-900 transition"
                    >
                      Page {cit.page}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Fallback Citation Modal if user is in focus mode */}
      {!splitView && activeCitation && (
        <CitationDrawer
          citation={activeCitation}
          onClose={() => setActiveCitation(null)}
        />
      )}
    </main>
  );
}
