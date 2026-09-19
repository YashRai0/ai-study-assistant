import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

// A small, honest demo of the product's actual flashcard mechanic — not a
// generic marketing stat. Flips once on load, then stays clickable so a
// visitor can try the interaction themselves before ever signing up.
function StudyCardPreview() {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label="Flip the example flashcard"
        className="group h-40 w-64 [perspective:1200px]"
      >
        <div
          className={`relative h-full w-full rounded-2xl shadow-lg shadow-black/20 transition-transform duration-700 [transform-style:preserve-3d] ${
            flipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          <div className="absolute inset-0 flex items-center rounded-2xl border border-white/10 bg-ink-600 p-5 text-left [backface-visibility:hidden]">
            <p className="font-display text-lg leading-snug text-paper">
              What's the difference between DDL and DML?
            </p>
          </div>
          <div className="absolute inset-0 flex items-center rounded-2xl border border-highlight/40 bg-ink-600 p-5 text-left [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <p className="text-sm leading-relaxed text-paper/90">
              DDL defines the structure, like CREATE and ALTER. DML changes the
              data inside it, like INSERT and UPDATE.
            </p>
          </div>
        </div>
      </button>
      <p className="text-xs text-paper/50">This is what your notes become. Click the card to flip it.</p>
    </div>
  );
}

const FEATURES = [
  "Chat with your own notes, not the whole internet",
  "Practice zeroes in on what you actually don't know yet",
  "Spaced review keeps it from slipping away",
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Couldn't log you in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-ink-900 px-12 py-14 md:flex">
        <div>
          <h2 className="font-display text-3xl font-semibold leading-tight text-paper">
            Turn today's notes into tomorrow's exam-ready recall.
          </h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-paper/80">
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="mt-0.5 h-5 w-5 shrink-0 text-sage"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M6.5 10.5l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <StudyCardPreview />
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-2xl font-semibold text-ink-900">Log in</h1>
          <p className="mt-1 text-sm text-ink-400">Welcome back — pick up where you left off.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-ink-100 px-4 py-3 outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/40"
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-ink-100 px-4 py-3 pr-11 outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/40"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400 hover:text-ink-900"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M6.5 6.7C4.4 8.1 2.9 10 2 12c1.6 3.6 5.4 7 10 7 1.8 0 3.4-.5 4.9-1.3M9.9 5.2A9.9 9.9 0 0112 5c4.6 0 8.4 3.4 10 7-.5 1.1-1.1 2.1-1.9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                    <path d="M2 12c1.6-3.6 5.4-7 10-7s8.4 3.4 10 7c-1.6 3.6-5.4 7-10 7s-8.4-3.4-10-7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </button>
            </div>

            <div className="flex justify-end pt-0.5">
              <Link
                to="/forgot-password"
                className="text-xs text-ink-500 hover:text-ink-900 underline underline-offset-2 transition"
              >
                Forgot password?
              </Link>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-ink-900 px-6 py-3 text-paper transition hover:bg-ink-600 disabled:opacity-50"
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p className="mt-4 text-sm text-ink-400">
            No account yet? <Link to="/register" className="underline">Create one</Link>
          </p>
        </div>
      </section>
    </main>
  );
}