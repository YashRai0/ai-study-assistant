import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";
import Button from "../components/ui/Button.jsx";
import Card from "../components/ui/Card.jsx";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

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
      .then(({ data }) => setGroups(data.groups || []))
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
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-ink-100 dark:border-[#273352] pb-6">
        <div className="flex items-center gap-2">
          <Badge variant="indigo" size="sm" dot>
            Peer Collaboration
          </Badge>
          <span className="text-xs text-ink-400">Shared Study Spaces</span>
        </div>
        <h1 className="font-display text-3xl font-extrabold text-ink-900 dark:text-ink-50 sm:text-4xl">
          Study Groups
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          Share lecture slides and notes with classmates, exchange questions, and synthesize group knowledge collaboratively.
        </p>
      </div>

      {/* Two-Column Actions */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {/* Create Group Card */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-100">
            Create a New Group
          </h2>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Start a shared space and invite your classmates with a unique code.
          </p>

          <form onSubmit={createGroup} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-ink-400 mb-1">
                Group Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Distributed Systems 401"
                required
                className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
              />
            </div>

            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-ink-400 mb-1">
                Subject (Optional)
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Computer Science"
                className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm text-ink-900 dark:text-ink-100 outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
              />
            </div>

            <Button
              type="submit"
              variant="secondary"
              size="md"
              loading={creating}
              className="w-full"
            >
              Create Group
            </Button>
          </form>
        </Card>

        {/* Join Group Card */}
        <Card className="p-6">
          <h2 className="font-display text-lg font-bold text-ink-900 dark:text-ink-100">
            Join Existing Group
          </h2>
          <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            Enter the 6-character invitation code shared by your peer.
          </p>

          <form onSubmit={joinGroup} className="mt-4 space-y-3.5">
            <div>
              <label className="block text-2xs font-bold uppercase tracking-wider text-ink-400 mb-1">
                Invitation Code
              </label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. K9X42A"
                required
                maxLength={10}
                className="w-full rounded-xl border border-ink-200 dark:border-[#273352] bg-white dark:bg-[#131a2c] px-3.5 py-2 text-sm font-mono tracking-widest text-ink-900 dark:text-ink-100 uppercase outline-none focus:border-highlight focus:ring-1 focus:ring-highlight"
              />
            </div>

            <div className="pt-7">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={joining}
                className="w-full"
              >
                Join with Code
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-semibold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Your Groups Section */}
      <section className="mt-12">
        <h2 className="font-display text-xl font-bold text-ink-900 dark:text-ink-50">
          Your Active Study Groups
        </h2>

        {loading ? (
          <div className="mt-4 space-y-3">
            <div className="h-16 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
            <div className="h-16 animate-pulse rounded-2xl bg-ink-100 dark:bg-ink-800" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            className="mt-4"
            icon="👥"
            title="You're not in any study groups yet"
            description="Create a group to invite classmates, or enter an invitation code above to join a cohort."
          />
        ) : (
          <ul className="mt-4 space-y-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  to={`/groups/${g.id}`}
                  className="flex items-center justify-between rounded-2xl border border-ink-100 dark:border-[#273352] bg-white dark:bg-[#1b233a] p-4 transition hover:border-highlight hover:shadow-sm"
                >
                  <div>
                    <h3 className="font-display text-base font-bold text-ink-900 dark:text-ink-100">
                      {g.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {g.subject || "General"} · {g.role === "owner" ? "Group Creator" : "Member"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-highlight/15 dark:bg-highlight/20 border border-highlight/30 px-3 py-1 font-mono text-xs font-bold tracking-widest text-amber-900 dark:text-amber-200">
                      {g.inviteCode}
                    </span>
                    <span className="text-xs font-bold text-ink-400 hover:text-ink-900">
                      Enter →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
