import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

const LOGGED_IN_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/chat-all", label: "Chat all notes" },
  { to: "/search", label: "Search" },
  { to: "/analytics", label: "Analytics" },
  { to: "/study-plan", label: "Study Plan" },
  { to: "/groups", label: "Groups" },
  { to: "/review", label: "Review" },
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

  return (
    <header className="border-b border-ink-100">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="font-display text-xl font-semibold text-ink-900" onClick={() => setMenuOpen(false)}>
          Study<span className="highlight-mark">Assistant</span>
        </Link>

        {email ? (
          <>
            <div className="hidden items-center gap-4 md:flex">
              <span className="text-sm text-ink-400">{email}</span>
              {LOGGED_IN_LINKS.filter((l) => l.to !== "/dashboard").map((l) => (
                <Link key={l.to} to={l.to} className="text-sm font-medium text-ink-900">
                  {l.label}
                </Link>
              ))}
              <Link
                to="/dashboard"
                className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-600"
              >
                Dashboard
              </Link>
              <button onClick={handleLogout} className="text-sm text-ink-400 hover:text-ink-900">
                Log out
              </button>
            </div>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span className="text-xl leading-none text-ink-900">{menuOpen ? "✕" : "☰"}</span>
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-ink-900">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-paper transition hover:bg-ink-600"
            >
              Sign up free
            </Link>
          </div>
        )}
      </nav>

      {email && menuOpen && (
        <div className="border-t border-ink-100 px-6 py-4 md:hidden">
          <p className="mb-3 text-sm text-ink-400">{email}</p>
          <div className="flex flex-col gap-3">
            {LOGGED_IN_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="text-base font-medium text-ink-900"
              >
                {l.label}
              </Link>
            ))}
            <button onClick={handleLogout} className="text-left text-base text-ink-400">
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}