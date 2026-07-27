import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [creating, setCreating] = useState(false);

  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {
    loadGroups();
  }, []);

  function loadGroups() {
    setLoading(true);
    client
      .get("/groups")
      .then(({ data }) => setGroups(data.groups))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }

  async function createGroup(e) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await client.post("/groups", { name, subject: subject || undefined });
      setName("");
      setSubject("");
      loadGroups();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't create the group. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function joinGroup(e) {
    e.preventDefault();
    setJoining(true);
    setError("");
    try {
      await client.post("/groups/join", { inviteCode });
      setInviteCode("");
      loadGroups();
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't join that group. Please check the invite code.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl font-semibold text-ink-900">Study groups</h1>
      <p className="mt-2 text-ink-600">
        Share notes with classmates and ask questions grounded in everything the group has shared.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <form onSubmit={createGroup} className="space-y-3 rounded-2xl border border-ink-100 bg-white/70 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Create a group</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            required
            className="w-full rounded-full border border-ink-100 px-4 py-2 text-sm"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject (optional)"
            className="w-full rounded-full border border-ink-100 px-4 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={creating}
            className="w-full rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </form>

        <form onSubmit={joinGroup} className="space-y-3 rounded-2xl border border-ink-100 bg-white/70 p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Join a group</h2>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            required
            className="w-full rounded-full border border-ink-100 px-4 py-2 text-sm uppercase tracking-widest"
          />
          <button
            type="submit"
            disabled={joining}
            className="w-full rounded-full bg-highlight px-4 py-2 text-sm font-medium text-ink-900 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join group"}
          </button>
        </form>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink-900">Your groups</h2>
        {loading ? (
          <p className="mt-4 text-ink-400">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-ink-100 p-6 text-center text-ink-400">
            You're not in any groups yet — create one or join with an invite code above.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/groups/${g.id}`}
                  className="flex items-center justify-between rounded-xl border border-ink-100 bg-white/70 px-4 py-3 hover:border-highlight"
                >
                  <div>
                    <p className="font-medium text-ink-900">{g.name}</p>
                    <p className="text-xs text-ink-400">
                      {g.subject} · {g.role === "owner" ? "You own this group" : "Member"}
                    </p>
                  </div>
                  <span className="rounded-full bg-highlight/20 px-3 py-1 text-xs font-mono tracking-widest text-ink-900">
                    {g.inviteCode}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
