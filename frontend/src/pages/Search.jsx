import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";

export default function Search() {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("All subjects");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .get("/search/subjects")
      .then(({ data }) => setSubjects(data.subjects))
      .catch(() => setSubjects([]));
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await client.post("/search", { query, subject });
      setResults(data.results);
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't run that search. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Search across your notes</h1>
      <p className="mt-2 text-ink-600">
        Search by meaning, not just keywords — ask about a concept and it'll surface the right
        passage even if it's phrased differently in your notes.
      </p>

      <form onSubmit={handleSearch} className="mt-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubject("All subjects")}
            className={`rounded-full px-4 py-2 text-sm ${
              subject === "All subjects" ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
            }`}
          >
            All subjects
          </button>
          {subjects.map((s) => (
            <button
              type="button"
              key={s}
              onClick={() => setSubject(s)}
              className={`rounded-full px-4 py-2 text-sm ${
                subject === s ? "bg-ink-900 text-paper" : "border border-ink-100 text-ink-600"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. why processes wait on each other"
            className="flex-1 rounded-full border border-ink-100 bg-white px-5 py-3 outline-none focus:border-highlight"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-highlight px-6 py-3 font-medium text-ink-900 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {error && <p className="mt-4 text-red-600">{error}</p>}

      {results && (
        <div className="mt-8 space-y-4">
          {results.length === 0 ? (
            <p className="text-ink-400">
              No matches yet — upload some notes for this subject, or try a different query.
            </p>
          ) : (
            results.map((r, i) => (
              <Link
                key={i}
                to={`/chat/${r.pdfId}`}
                className="block rounded-xl border border-ink-100 bg-white/70 p-5 transition hover:border-highlight"
              >
                <div className="flex items-center justify-between text-sm text-ink-400">
                  <span>
                    {r.filename} · {r.subject} · Page {r.page}
                  </span>
                  <span>{Math.round(r.score * 100)}% match</span>
                </div>
                <p className="mt-2 text-ink-900">{r.text.slice(0, 320)}{r.text.length > 320 ? "…" : ""}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </main>
  );
}
