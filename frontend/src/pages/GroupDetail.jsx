import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { streamChatRequest } from "../api/streamChat.js";

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
      setMembers(membersRes.data.members);
      setSharedPdfs(pdfsRes.data.pdfs);
      setMyPdfs(myPdfsRes.data.pdfs);
      setMessages(historyRes.data.history);
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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-red-600">{error}</p>
      </main>
    );
  }

  if (!group) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-ink-400">Loading…</p>
      </main>
    );
  }

  const sharedIds = new Set(sharedPdfs.map((p) => String(p.pdfId)));
  const shareable = myPdfs.filter((p) => !sharedIds.has(String(p.id)));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900">{group.name}</h1>
          <p className="text-sm text-ink-400">
            {group.subject} · Invite code:{" "}
            <span className="font-mono tracking-widest text-ink-900">{group.inviteCode}</span>
          </p>
        </div>
        {group.role === "owner" ? (
          <button onClick={deleteGroup} className="text-sm text-red-600 hover:underline">
            Delete group
          </button>
        ) : (
          <button onClick={leaveGroup} className="text-sm text-ink-400 hover:text-ink-900">
            Leave group
          </button>
        )}
      </div>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Members ({members.length})</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {members.map((m, i) => (
            <span key={i} className="rounded-full border border-ink-100 px-3 py-1 text-xs text-ink-600">
              {m.email} {m.role === "owner" && "· owner"}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink-900">Shared notes</h2>
        {shareable.length > 0 && (
          <div className="mt-2 flex gap-2">
            <select
              value={selectedPdfId}
              onChange={(e) => setSelectedPdfId(e.target.value)}
              className="flex-1 rounded-full border border-ink-100 px-4 py-2 text-sm"
            >
              <option value="">Share one of your PDFs…</option>
              {shareable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.filename}
                </option>
              ))}
            </select>
            <button
              onClick={shareSelectedPdf}
              disabled={!selectedPdfId}
              className="rounded-full bg-ink-900 px-4 py-2 text-sm text-paper disabled:opacity-50"
            >
              Share
            </button>
          </div>
        )}
        {sharedPdfs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-400">Nothing shared yet.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {sharedPdfs.map((p) => (
              <li
                key={p.pdfId}
                className="flex items-center justify-between rounded-lg border border-ink-100 bg-white/70 px-3 py-2 text-sm"
              >
                <span>
                  {p.filename} <span className="text-ink-400">· shared by {p.sharedBy}</span>
                </span>
                <button onClick={() => unshare(p.pdfId)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink-900">Group chat</h2>
        <p className="text-sm text-ink-400">Answers are grounded in everything shared above, visible to the whole group.</p>

        <div className="mt-4 max-h-96 space-y-3 overflow-y-auto rounded-2xl border border-ink-100 bg-white/40 p-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
                m.role === "user" ? "ml-auto bg-ink-900 text-paper" : "bg-white/90 text-ink-900"
              }`}
            >
              {m.role === "user" && m.author && (
                <p className="mb-1 text-xs opacity-70">{m.author}</p>
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
          className="mt-3 flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something grounded in the group's shared notes…"
            className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-3 text-sm outline-none focus:border-highlight"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-ink-900 px-6 py-3 text-sm text-paper disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}
