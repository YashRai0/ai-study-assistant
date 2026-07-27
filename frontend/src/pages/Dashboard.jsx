import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";
import UploadBox from "../components/UploadBox.jsx";

export default function Dashboard() {
  const [pdfs, setPdfs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    loadPdfs();
  }, []);

  function loadPdfs() {
    setLoading(true);
    client
      .get("/upload")
      .then(({ data }) => setPdfs(data.pdfs))
      .catch(() => setPdfs([]))
      .finally(() => setLoading(false));
  }

  async function handleDelete(pdf) {
    if (!window.confirm(`Delete "${pdf.filename}"? This removes the file and its chat history — this can't be undone.`)) {
      return;
    }
    setDeletingId(pdf.id);
    try {
      await client.delete(`/upload/${pdf.id}`);
      setPdfs((prev) => prev.filter((p) => p.id !== pdf.id));
    } catch {
      window.alert("Couldn't delete this PDF right now. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Your notes</h1>
      <p className="mt-2 text-ink-600">
        Upload a new PDF, or jump back into one you've already added. Want to search or ask
        questions across everything at once? Try{" "}
        <Link to="/search" className="underline">Search</Link> or{" "}
        <Link to="/chat-all" className="underline">Chat all notes</Link>. Curious how you're
        doing? Check your{" "}
        <Link to="/analytics" className="underline">analytics dashboard</Link>.
      </p>

      <div className="mt-8">
        <UploadBox onUploaded={loadPdfs} />
      </div>

      <div className="mt-10">
        {loading ? (
          <p className="text-ink-400">Loading…</p>
        ) : pdfs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
            Nothing here yet — upload a PDF above to get started.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {pdfs.map((pdf) => (
              <li
                key={pdf.id}
                className="rounded-xl border border-ink-100 bg-white/70 p-5"
              >
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg font-semibold text-ink-900">{pdf.filename}</p>
                  <span className="rounded-full bg-highlight/20 px-3 py-1 text-xs font-medium text-ink-900">
                    {pdf.subject}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-400">
                  {pdf.chunkCount} sections indexed
                  {pdf.extractionMethod === "ocr" && " · processed with OCR"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                  <Link className="rounded-full bg-ink-900 px-3 py-1 text-paper" to={`/chat/${pdf.id}`}>Chat</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/summary/${pdf.id}`}>Summary</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/flashcards/${pdf.id}`}>Flashcards</Link>
                  <Link className="rounded-full border border-ink-900 px-3 py-1 text-ink-900" to={`/quiz/${pdf.id}`}>Quiz</Link>
                  <button
                    onClick={() => handleDelete(pdf)}
                    disabled={deletingId === pdf.id}
                    className="ml-auto text-red-600 hover:underline disabled:opacity-50"
                  >
                    {deletingId === pdf.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
