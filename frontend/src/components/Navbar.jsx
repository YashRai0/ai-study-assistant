import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../api/AuthContext.jsx";

const PRIMARY_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/study", label: "Study" },
  { to: "/review", label: "Review" },
  { to: "/analytics", label: "Analytics" },
  { to: "/chat-all", label: "Chat All" },
];

const SECONDARY_LINKS = [
  { to: "/study-plan", label: "Study Plan", icon: "📅" },
  { to: "/groups", label: "Study Groups", icon: "👥" },
  { to: "/search", label: "Search Notes", icon: "🔎" },
  { to: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Navbar() {
  const { email, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  function handleLogout() {
    logout();
    setMenuOpen(false);
    setMoreOpen(false);
    navigate("/");
  }

  function openCommandPalette() {
    window.dispatchEvent(new CustomEvent("open-command-palette"));
  }

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/80 backdrop-blur-md transition-all shadow-2xs">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo matching site theme (ink, highlight, paper, Fraunces serif) */}
        <div className="flex items-center gap-6">
          <Link
            to={email ? "/dashboard" : "/"}
            className="group flex items-center gap-2.5 font-display text-xl font-bold tracking-tight text-ink-900 transition"
            onClick={() => setMenuOpen(false)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink-900 text-highlight font-display text-base font-bold shadow-xs ring-1 ring-ink-100 transition group-hover:scale-105">
              P
            </span>
            <span className="font-display">
              Prep<span className="highlight-mark">nexia</span>
            </span>
          </Link>

          {/* Desktop Primary Nav */}
          {email && (
            <div className="hidden lg:flex items-center gap-1">
              {PRIMARY_LINKS.map((link) => {
                const isActive = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                      isActive
                        ? "bg-ink-900 text-paper shadow-2xs"
                        : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}

              {/* More Dropdown */}
              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    moreOpen ? "bg-ink-100 text-ink-900" : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
                  }`}
                >
                  <span>More</span>
                  <span className="text-[10px]">▼</span>
                </button>

                {moreOpen && (
                  <div className="absolute left-0 mt-2 w-48 rounded-2xl border border-ink-100 bg-white p-1.5 shadow-lg ring-1 ring-black/5">
                    {SECONDARY_LINKS.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMoreOpen(false)}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 hover:text-ink-900"
                      >
                        <span>{link.icon}</span>
                        <span>{link.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Nav Actions */}
        {email ? (
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Command Palette Launcher */}
            <button
              type="button"
              onClick={openCommandPalette}
              className="inline-flex items-center gap-2 rounded-full border border-ink-100 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 shadow-2xs transition hover:border-ink-400 hover:text-ink-900"
              title={`Command Palette (${isMac ? "⌘K" : "Ctrl+K"})`}
            >
              <span>🔍</span>
              <span className="hidden sm:inline">Actions</span>
              <kbd className="rounded border border-ink-100 bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-600 shadow-2xs">
                {isMac ? "⌘K" : "Ctrl+K"}
              </kbd>
            </button>

            {/* Profile & Settings (Email intentionally omitted per privacy preferences) */}
            <div className="hidden md:flex items-center gap-2">
              <Link
                to="/settings"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-100 bg-paper text-ink-600 transition hover:border-ink-300 hover:bg-white hover:text-ink-900 shadow-2xs"
                title="Account Settings"
              >
                ⚙️
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-ink-100 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-600 transition hover:border-ink-300 hover:bg-paper hover:text-ink-900 shadow-2xs"
              >
                Log out
              </button>
            </div>

            {/* Mobile Menu Hamburger */}
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-100 bg-white text-ink-800 shadow-2xs lg:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span className="text-base leading-none font-bold">{menuOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-xs sm:text-sm font-semibold text-ink-700 hover:text-ink-900 transition">
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-full bg-ink-900 px-4 py-2 text-xs sm:text-sm font-semibold text-paper shadow-xs transition hover:bg-ink-600"
            >
              Get Started Free
            </Link>
          </div>
        )}
      </nav>

      {/* Mobile Drawer Menu (No email displayed) */}
      {email && menuOpen && (
        <div className="border-t border-ink-100 bg-white/95 px-5 py-4 backdrop-blur-md lg:hidden shadow-md">
          {/* Mobile Command Palette Button */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              openCommandPalette();
            }}
            className="mb-4 flex w-full items-center justify-between rounded-xl border border-ink-100 bg-paper p-2.5 text-xs font-semibold text-ink-800"
          >
            <span className="flex items-center gap-2">
              <span>🔍</span>
              <span>Open Command Palette</span>
            </span>
            <kbd className="rounded border border-ink-100 bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-600">
              {isMac ? "⌘K" : "Ctrl+K"}
            </kbd>
          </button>

          {/* Primary Nav Links */}
          <div className="grid grid-cols-2 gap-2 pb-3 border-b border-ink-100">
            {PRIMARY_LINKS.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={`rounded-xl p-2.5 text-center text-xs font-semibold transition ${
                    isActive
                      ? "bg-ink-900 text-paper"
                      : "border border-ink-100 bg-paper text-ink-800 hover:bg-ink-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Secondary Nav Links */}
          <div className="mt-3 space-y-1">
            {SECONDARY_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-700 hover:bg-paper"
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>

          {/* Account Logout */}
          <div className="mt-4 pt-3 border-t border-ink-100 flex items-center justify-between">
            <span className="text-xs text-ink-400 font-medium">Account Session Active</span>
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
