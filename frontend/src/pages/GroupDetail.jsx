import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [sharedPdfs, setSharedPdfs] = useState([]);
  const [myPdfs, setMyPdfs] = useState([]);
  const [selectedPdfId, setSelectedPdfId] = useState("");

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    load();
  }, [groupId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function load() {
    try {
      const [groupRes, membersRes, pdfsRes, myPdfsRes, historyRes] = await Promise.all([
        client.get(`/groups/${groupId}`),
        client.get(`/groups/${groupId}/members`),
        client.get(`/groups/${groupId}/pdfs`),
        client.get("/upload"),
        client.get(`/groups/${groupId}/chat/history`),
      ]);
      setGroup(groupRes.data.group);
      setMembers(membersRes.data.members || []);
      setSharedPdfs(pdfsRes.data.pdfs || []);
      setMyPdfs(myPdfsRes.data.pdfs || []);
      setMessages(historyRes.data.history || []);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't load this group.");
    }
  }

  async function shareSelectedPdf() {
    if (!selectedPdfId) return;
    try {
      await client.post(`/groups/${groupId}/share`, { pdfId: selectedPdfId });
      setSelectedPdfId("");
      load();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't share that PDF.");
    }
  }

  async function unshare(pdfId) {
    if (!window.confirm("Remove this PDF from the group?")) return;
    await client.delete(`/groups/${groupId}/share/${pdfId}`);
    load();
  }

  async function leaveGroup() {
    if (!window.confirm("Leave this group?")) return;
    try {
      await client.delete(`/groups/${groupId}/leave`);
      navigate("/groups");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't leave the group.");
    }
  }

  async function deleteGroup() {
    if (!window.confirm("Delete this group for everyone? This can't be undone.")) return;
    await client.delete(`/groups/${groupId}`);
    navigate("/groups");
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: "user", content: message, ts: Date.now() }]);
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "", ts: Date.now() }]);

    try {
      await streamChatRequest(`/groups/${groupId}/chat`, { message }, {
        onToken: (_token, accumulated) => {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated };
            return updated;
          });
        },
      });
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

  if (error && !group) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/groups")} className="mt-4">
          ← Back to Study Groups
        </Button>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-48 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
      </main>
    );
  }

  const sharedIds = new Set(sharedPdfs.map((p) => String(p.pdfId)));
  const shareable = myPdfs.filter((p) => !sharedIds.has(String(p.id)));

  // Safe member display (never exposing full raw emails)
  function formatMemberName(m) {
    if (!m?.email) return "Member";
    const namePart = m.email.split("@")[0];
    return namePart.charAt(0).toUpperCase() + namePart.slice(1);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between border-b border-ink-100 dark:border-[#273352] pb-6">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="indigo" size="sm" dot>
              {group.subject || "Study Group"}
            </Badge>
            <span className="text-xs text-ink-400 font-mono tracking-wider">
              Invite: {group.inviteCode}
            </span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-extrabold text-ink-900 dark:text-ink-50">
            {group.name}
          </h1>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Shared peer learning workspace · All questions grounded in group notes
          </p>
        </div>

        <div className="flex items-center gap-2">
          {group.role === "owner" ? (
            <Button variant="danger" size="sm" onClick={deleteGroup}>
              Delete Group
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={leaveGroup}>
              Leave Group
            </Button>
          )}
        </div>
      </div>

      {/* Members Section */}
      <Card className="mt-6 p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-400">
          Cohort Members ({members.length})
        </h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {members.map((m, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-[#273352] bg-ink-50/70 dark:bg-[#131a2c] px-3 py-1 text-xs font-medium text-ink-700 dark:text-ink-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {formatMemberName(m)}
              {m.role === "owner" && (
                <span className="text-2xs font-bold text-highlight">· Owner</span>
              )}
            </span>
          ))}
        </div>
      </Card>

      {/* Shared Materials Section */}
      <Card className="mt-6 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-50">
              Shared Knowledge Base ({sharedPdfs.length})
            </h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Documents accessible to all group members for cross-questioning.
            </p>
          </div>

          {shareable.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectedPdfId}
                onChange={(e) => setSelectedPdfId(e.target.value)}
                className="rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3 py-1.5 text-xs text-ink-900 dark:text-ink-100 outline-none focus:border-highlight"
              >
                <option value="">Select one of your PDFs…</option>
                {shareable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.filename}
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={shareSelectedPdf}
                disabled={!selectedPdfId}
              >
                Share
              </Button>
            </div>
          )}
        </div>

        {sharedPdfs.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink-200 dark:border-[#273352] p-6 text-center text-xs text-ink-400">
            No materials shared yet. Share a document from your library to start learning together.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {sharedPdfs.map((p) => (
              <li
                key={p.pdfId}
                className="flex items-center justify-between rounded-xl border border-ink-100 dark:border-[#273352] bg-ink-50/50 dark:bg-[#131a2c] p-3 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">📄</span>
                  <span className="font-semibold text-ink-900 dark:text-ink-100">{p.filename}</span>
                  <span className="text-ink-400">· shared by {p.sharedBy}</span>
                </div>
                <button
                  onClick={() => unshare(p.pdfId)}
                  className="font-semibold text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Group Chat Console */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-50">
          Cohort AI Discussion
        </h2>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Responses are synthesized and cited from all materials shared above.
        </p>

        <Card className="mt-4 p-4">
          <div className="max-h-96 space-y-3 overflow-y-auto pb-2">
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-ink-400">
                No discussion yet. Ask a question to synthesize the group's shared knowledge!
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-auto bg-ink-900 text-paper dark:bg-highlight dark:text-ink-950 shadow-2xs"
                    : "bg-ink-50 dark:bg-[#131a2c] text-ink-900 dark:text-ink-50 border border-ink-100 dark:border-[#273352]"
                }`}
              >
                {m.role === "user" && m.author && (
                  <p className="mb-1 text-2xs font-semibold opacity-70">{m.author}</p>
                )}
                {m.content}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="mt-4 flex gap-2 border-t border-ink-100 dark:border-[#273352] pt-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything grounded in the group's shared materials…"
              className="flex-1 rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-4 py-2.5 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight placeholder:text-ink-400"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={sending}
              disabled={!input.trim()}
            >
              Send
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
