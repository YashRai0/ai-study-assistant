import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

const LOGGED_IN_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/study", label: "Study" },
  { to: "/chat-all", label: "Chat all notes" },
  { to: "/search", label: "Search" },
  { to: "/analytics", label: "Analytics" },
  { to: "/study-plan", label: "Study Plan" },
  { to: "/groups", label: "Groups" },
  { to: "/review", label: "Review" },
  { to: "/settings", label: "Settings" },
];

export default function Navbar() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate("/");
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="border-b border-ink-100 bg-white/70 backdrop-blur-md sticky top-0 z-40">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link to="/" className="font-display text-xl font-semibold text-ink-900" onClick={() => setMenuOpen(false)}>
          Study<span className="highlight-mark">Assistant</span>
        </Link>

        {email ? (
          <>
            <div className="hidden items-center gap-3.5 md:flex">
              {/* Command Palette Trigger Pill */}
              <button
                type="button"
                onClick={openCommandPalette}
                className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-ink-50/70 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100 hover:text-ink-900 transition shadow-2xs"
                title="Open Command Palette (Ctrl+K or ⌘K)"
              >
                <span>🔍</span>
                <span className="hidden lg:inline">Quick actions</span>
                <kbd className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500 shadow-2xs">
                  {isMac ? "⌘K" : "Ctrl+K"}
                </kbd>
              </button>

              <span className="text-xs text-ink-400">{email}</span>
              {LOGGED_IN_LINKS.filter((l) => l.to !== "/dashboard").map((l) => (
                <Link key={l.to} to={l.to} className="text-xs font-medium text-ink-900 hover:text-indigo-600 transition">
                  {l.label}
                </Link>
              ))}
              <Link
                to="/dashboard"
                className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper transition hover:bg-ink-800 shadow-xs"
              >
                Dashboard
              </Link>
              <button onClick={handleLogout} className="text-xs text-ink-400 hover:text-ink-900 transition">
                Log out
              </button>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={openCommandPalette}
                className="flex h-9 items-center gap-1.5 rounded-full border border-ink-200 bg-ink-50/70 px-2.5 text-xs font-semibold text-ink-700"
                aria-label="Open Command Palette"
              >
                <span>🔍</span>
                <kbd className="rounded border border-ink-200 bg-white px-1 font-mono text-[9px] text-ink-500">
                  {isMac ? "⌘K" : "Ctrl+K"}
                </kbd>
              </button>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
              >
                <span className="text-xl leading-none text-ink-900">{menuOpen ? "✕" : "☰"}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink-900">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-800 shadow-xs"
            >
              Sign up free
            </Link>
          </div>
        )}
      </nav>

      {email && menuOpen && (
        <div className="border-t border-ink-100 bg-white px-6 py-4 md:hidden">
          <p className="mb-3 text-xs text-ink-400">{email}</p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                openCommandPalette();
              }}
              className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50/60 p-2.5 text-xs font-semibold text-ink-800"
            >
              <span className="flex items-center gap-2">
                <span>🔍</span>
                <span>Open Command Palette</span>
              </span>
              <kbd className="rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                {isMac ? "⌘K" : "Ctrl+K"}
              </kbd>
            </button>
            {LOGGED_IN_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="text-sm font-medium text-ink-900"
              >
                {l.label}
              </Link>
            ))}
            <button onClick={handleLogout} className="text-left text-sm text-ink-400">
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
