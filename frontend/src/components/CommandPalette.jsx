import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client.js";
import { useAuth } from "../api/AuthContext.jsx";

const STATIC_COMMANDS = [
  {
    id: "action-study-session",
    title: "Start Focused Session (15m)",
    subtitle: "Adaptive Pomodoro study block",
    category: "Actions",
    icon: "⏱️",
    action: (navigate) => navigate("/study-session?minutes=15"),
    keywords: ["study", "session", "pomodoro", "timer", "focus"],
  },
  {
    id: "action-review",
    title: "Review Spaced Due Queue",
    subtitle: "Strengthen retention before forgetting curve",
    category: "Actions",
    icon: "🔄",
    action: (navigate) => navigate("/review"),
    keywords: ["review", "spaced", "repetition", "flashcard", "memory"],
  },
  {
    id: "action-chat-all",
    title: "Chat Across All Notes",
    subtitle: "Multi-document synthesis & queries",
    category: "Actions",
    icon: "💬",
    action: (navigate) => navigate("/chat-all"),
    keywords: ["chat", "rag", "ask", "ai", "notes"],
  },
  {
    id: "action-diagnostic",
    title: "Take Knowledge Diagnostic",
    subtitle: "Calibrate starting mastery baseline",
    category: "Actions",
    icon: "🧭",
    action: (navigate) => navigate("/diagnostic"),
    keywords: ["diagnostic", "test", "baseline", "exam", "quiz"],
  },
  {
    id: "action-toggle-theme",
    title: "Toggle Dark / Light Theme",
    subtitle: "Switch between midnight ink and notebook light mode",
    category: "Actions",
    icon: "🌓",
    action: () => window.dispatchEvent(new CustomEvent("toggle-theme")),
    keywords: ["theme", "dark", "light", "mode", "color", "night"],
  },
  {
    id: "nav-dashboard",
    title: "Learning Studio Dashboard",
    subtitle: "Overview, next best action, and bento grid",
    category: "Navigation",
    icon: "🏠",
    action: (navigate) => navigate("/dashboard"),
    keywords: ["dashboard", "home", "main"],
  },
  {
    id: "nav-study",
    title: "Course Catalog & Syllabus",
    subtitle: "Browse all enrolled courses & modules",
    category: "Navigation",
    icon: "📚",
    action: (navigate) => navigate("/study"),
    keywords: ["course", "catalog", "syllabus", "modules"],
  },
  {
    id: "nav-search",
    title: "Global Search & Highlights",
    subtitle: "Search text across all uploaded documents",
    category: "Navigation",
    icon: "🔍",
    action: (navigate) => navigate("/search"),
    keywords: ["search", "find", "keyword", "documents"],
  },
  {
    id: "nav-analytics",
    title: "Learning Analytics & Mastery",
    subtitle: "Performance metrics and retention graphs",
    category: "Navigation",
    icon: "📊",
    action: (navigate) => navigate("/analytics"),
    keywords: ["analytics", "mastery", "progress", "stats"],
  },
  {
    id: "nav-study-plan",
    title: "Dynamic Study Plan",
    subtitle: "Target exam pacing and schedule",
    category: "Navigation",
    icon: "📅",
    action: (navigate) => navigate("/study-plan"),
    keywords: ["plan", "schedule", "calendar", "exam"],
  },
  {
    id: "nav-groups",
    title: "Study Groups & Peer Collaboration",
    subtitle: "Shared notes, decks, and discussions",
    category: "Navigation",
    icon: "👥",
    action: (navigate) => navigate("/groups"),
    keywords: ["groups", "social", "collaborate", "friends"],
  },
  {
    id: "nav-settings",
    title: "Account & Preferences",
    subtitle: "Manage profile, notifications, and security",
    category: "Navigation",
    icon: "⚙️",
    action: (navigate) => navigate("/settings"),
    keywords: ["settings", "preferences", "account", "profile"],
  },
];

export default function CommandPalette() {
  const { email } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // OS Detection for shortcut display
  const isMac = useMemo(() => {
    return typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  }, []);

  // Fetch courses on first load if logged in
  useEffect(() => {
    if (!email) return;
    client
      .get("/learning/courses")
      .then(({ data }) => setCourses(data.courses || []))
      .catch(() => setCourses([]));
  }, [email]);

  // Global Ctrl+K / Cmd+K and custom event listeners
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }

    function handleCustomOpen() {
      setOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleCustomOpen);
    };
  }, [open]);

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Combined searchable items
  const items = useMemo(() => {
    const dynamicCourseItems = courses.map((c) => ({
      id: `course-${c._id}`,
      title: c.title,
      subtitle: `Jump to course (${c.conceptCount || 0} concepts)`,
      category: "Courses",
      icon: "🎓",
      action: (nav) => nav(`/study?course=${c._id}`),
      keywords: ["course", c.title.toLowerCase(), c.subject?.toLowerCase() || ""],
    }));

    const all = [...STATIC_COMMANDS, ...dynamicCourseItems];

    if (!query.trim()) return all;

    const q = query.toLowerCase().trim();
    return all.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchSubtitle = item.subtitle.toLowerCase().includes(q);
      const matchKeywords = item.keywords?.some((k) => k.includes(q));
      return matchTitle || matchSubtitle || matchKeywords;
    });
  }, [courses, query]);

  // Reset selected index when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const executeItem = useCallback(
    (item) => {
      setOpen(false);
      item.action(navigate);
    },
    [navigate]
  );

  // Key navigation in input
  const handleInputKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1 < items.length ? idx + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 >= 0 ? idx - 1 : Math.max(0, items.length - 1)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        executeItem(items[selectedIndex]);
      } else if (query.trim()) {
        setOpen(false);
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex];
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/40 p-4 pt-16 sm:pt-24 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-100 bg-white/95 shadow-2xl shadow-ink-900/10 backdrop-blur-xl animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3.5">
          <span className="text-ink-400 text-lg" aria-hidden="true">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type a command or search (e.g. 'review', 'math', 'chat')..."
            className="w-full bg-transparent text-sm font-medium text-ink-900 placeholder:text-ink-400 focus:outline-hidden"
            autoComplete="off"
            spellCheck="false"
          />
          <kbd className="rounded-md border border-ink-200 bg-ink-50 px-2 py-0.5 font-mono text-[10px] font-bold text-ink-500 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-ink-700">No matching commands found</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/search?q=${encodeURIComponent(query.trim())}`);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold text-paper hover:bg-ink-800 transition"
              >
                <span>Search notes for &ldquo;{query}&rdquo;</span>
                <span>→</span>
              </button>
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => executeItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 cursor-pointer transition ${
                    isSelected
                      ? "bg-indigo-50 border-l-4 border-indigo-600 text-ink-900"
                      : "text-ink-700 hover:bg-ink-50/70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <p className={`truncate text-xs ${isSelected ? "font-bold text-ink-900" : "font-semibold text-ink-800"}`}>
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-ink-400">{item.subtitle}</p>
                    </div>
                  </div>

                  <span className="shrink-0 rounded-full bg-ink-100/70 px-2 py-0.5 text-[10px] font-medium text-ink-500">
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Palette Footer Help Bar */}
        <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-4 py-2 text-[11px] text-ink-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-ink-200 bg-white px-1 font-mono text-[9px] text-ink-600 shadow-2xs">
                ↑
              </kbd>
              <kbd className="rounded border border-ink-200 bg-white px-1 font-mono text-[9px] text-ink-600 shadow-2xs">
                ↓
              </kbd>{" "}
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-ink-200 bg-white px-1.5 font-mono text-[9px] text-ink-600 shadow-2xs">
                Enter
              </kbd>{" "}
              Select
            </span>
          </div>

          <span className="text-[10px]">
            Press <strong className="text-ink-600">{isMac ? "⌘K" : "Ctrl+K"}</strong> anytime
          </span>
        </div>
      </div>
    </div>
  );
}
