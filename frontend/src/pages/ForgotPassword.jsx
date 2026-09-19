import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";
import { formatApiError } from "../api/client.js";

export default function ForgotPassword() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(trimmed);
      setSubmitted(true);
    } catch (err) {
      setError(formatApiError(err, "Couldn't send password reset link. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-sm flex-col justify-center px-6 py-16">
      <div className="w-full">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Forgot your password?</h1>
        <p className="mt-2 text-sm text-ink-500">
          Enter the email address associated with your account, and we'll send you a link to reset your password.
        </p>

        {submitted ? (
          <div className="mt-6 space-y-5">
            <div className="rounded-2xl border border-sage/40 bg-sage/10 p-5 text-ink-800">
              <div className="flex items-start gap-3">
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="mt-0.5 h-5 w-5 shrink-0 text-sage"
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
                  <path
                    d="M6.5 10.5l2.2 2.2 4.8-5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="text-sm leading-relaxed">
                  <p className="font-medium text-ink-900">Check your inbox</p>
                  <p className="mt-1 text-ink-600">
                    If an account exists for <strong className="text-ink-900">{email}</strong>, a reset link has been sent. Please check your inbox and spam folder.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-ink-400">
              Didn't receive an email? Check your spam folder or{" "}
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-ink-900 underline underline-offset-2 hover:text-ink-600"
              >
                try another address
              </button>
              .
            </p>

            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-600"
              >
                Return to log in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-xs font-medium text-ink-700">
                Email address
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink-100 px-4 py-3 outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/40"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-600 disabled:opacity-50"
            >
              {loading ? "Sending reset link…" : "Send reset link"}
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="text-sm text-ink-500 underline underline-offset-2 transition hover:text-ink-900"
              >
                ← Back to log in
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
