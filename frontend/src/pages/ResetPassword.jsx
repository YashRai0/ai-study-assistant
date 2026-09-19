import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";
import { formatApiError } from "../api/client.js";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const emailParam = searchParams.get("email") || "";

  const { resetPassword } = useAuth();

  const [email, setEmail] = useState(emailParam);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Missing token in query string guard
  if (!token) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-sm flex-col justify-center px-6 py-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-ink-900">
          <h1 className="font-display text-lg font-semibold text-amber-900">Invalid or Missing Reset Link</h1>
          <p className="mt-2 text-sm text-amber-800 leading-relaxed">
            This password reset link is missing a security token or has already been used. Please request a new link to reset your password.
          </p>
          <div className="mt-5">
            <Link
              to="/forgot-password"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-paper transition hover:bg-ink-600"
            >
              Request a new reset link
            </Link>
          </div>
        </div>
        <div className="mt-4 text-center">
          <Link to="/login" className="text-sm text-ink-500 underline hover:text-ink-900">
            ← Return to log in
          </Link>
        </div>
      </main>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const targetEmail = email.trim();
    if (!targetEmail) {
      setError("Please provide your email address.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please check and try again.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(targetEmail, token, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(formatApiError(err, "Couldn't reset your password. The link may be expired or invalid."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-sm flex-col justify-center px-6 py-16">
      <div className="w-full">
        <h1 className="font-display text-2xl font-semibold text-ink-900">Set new password</h1>
        <p className="mt-2 text-sm text-ink-500">
          Enter a strong password with at least 8 characters.
        </p>

        {success ? (
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
                  <p className="font-medium text-ink-900">Password updated successfully</p>
                  <p className="mt-1 text-ink-600">
                    Your password has been changed. You can now log in with your new credentials.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-600"
              >
                Log in to your account
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-xs font-medium text-ink-700">
                Email address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-ink-100 px-4 py-3 outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/40"
              />
            </div>

            <div>
              <label htmlFor="reset-password" className="block text-xs font-medium text-ink-700">
                New password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="block text-xs font-medium text-ink-700">
                Confirm new password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="reset-confirm-password"
                  type={showConfirm ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-ink-100 px-4 py-3 pr-11 outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/40"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400 hover:text-ink-900"
                >
                  {showConfirm ? (
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
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{error}</p>
                {error.toLowerCase().includes("expired") || error.toLowerCase().includes("invalid") ? (
                  <p className="mt-2 text-xs">
                    Need a fresh link?{" "}
                    <Link to="/forgot-password" className="font-medium underline hover:text-red-900">
                      Request a new password reset
                    </Link>
                  </p>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-ink-900 px-6 py-3 text-sm font-medium text-paper transition hover:bg-ink-600 disabled:opacity-50"
            >
              {loading ? "Updating password…" : "Reset password"}
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
