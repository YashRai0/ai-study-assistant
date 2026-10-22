import test from "node:test";
import assert from "node:assert/strict";

const STATIC_COMMANDS = [
  {
    id: "action-study-session",
    title: "Start Focused Session (15m)",
    subtitle: "Adaptive Pomodoro study block",
    category: "Actions",
    keywords: ["study", "session", "pomodoro", "timer", "focus"],
  },
  {
    id: "action-review",
    title: "Review Spaced Due Queue",
    subtitle: "Strengthen retention before forgetting curve",
    category: "Actions",
    keywords: ["review", "spaced", "repetition", "flashcard", "memory"],
  },
  {
    id: "action-chat-all",
    title: "Chat Across All Notes",
    subtitle: "Multi-document synthesis & queries",
    category: "Actions",
    keywords: ["chat", "rag", "ask", "ai", "notes"],
  },
  {
    id: "nav-dashboard",
    title: "Learning Studio Dashboard",
    subtitle: "Overview, next best action, and bento grid",
    category: "Navigation",
    keywords: ["dashboard", "home", "main"],
  },
];

function filterCommands(commands, courses, query) {
  const dynamicCourseItems = courses.map((c) => ({
    id: `course-${c._id}`,
    title: c.title,
    subtitle: `Jump to course (${c.conceptCount || 0} concepts)`,
    category: "Courses",
    keywords: ["course", c.title.toLowerCase(), c.subject?.toLowerCase() || ""],
  }));

  const all = [...commands, ...dynamicCourseItems];
  if (!query || !query.trim()) return all;

  const q = query.toLowerCase().trim();
  return all.filter((item) => {
    const matchTitle = item.title.toLowerCase().includes(q);
    const matchSubtitle = item.subtitle.toLowerCase().includes(q);
    const matchKeywords = item.keywords?.some((k) => k.includes(q));
    return matchTitle || matchSubtitle || matchKeywords;
  });
}

function cycleSelection(currentIndex, total, direction) {
  if (total <= 0) return 0;
  if (direction === "down") {
    return currentIndex + 1 < total ? currentIndex + 1 : 0;
  }
  if (direction === "up") {
    return currentIndex - 1 >= 0 ? currentIndex - 1 : total - 1;
  }
  return currentIndex;
}

test("CommandPalette: empty query returns all static and dynamic course commands", () => {
  const courses = [{ _id: "c1", title: "Organic Chemistry", conceptCount: 12 }];
  const items = filterCommands(STATIC_COMMANDS, courses, "");
  assert.equal(items.length, STATIC_COMMANDS.length + 1);
  assert.equal(items[items.length - 1].category, "Courses");
});

test("CommandPalette: filters correctly by title", () => {
  const items = filterCommands(STATIC_COMMANDS, [], "review");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "action-review");
});

test("CommandPalette: filters correctly by keyword tag", () => {
  const items = filterCommands(STATIC_COMMANDS, [], "pomodoro");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "action-study-session");
});

test("CommandPalette: dynamically searches courses", () => {
  const courses = [
    { _id: "c1", title: "Quantum Physics", subject: "Physics" },
    { _id: "c2", title: "Microbiology", subject: "Biology" },
  ];
  const items = filterCommands(STATIC_COMMANDS, courses, "quantum");
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "course-c1");
  assert.equal(items[0].title, "Quantum Physics");
});

test("CommandPalette: arrow key cycling wraps around properly", () => {
  assert.equal(cycleSelection(0, 4, "down"), 1);
  assert.equal(cycleSelection(3, 4, "down"), 0); // wrap to top
  assert.equal(cycleSelection(0, 4, "up"), 3);   // wrap to bottom
  assert.equal(cycleSelection(2, 4, "up"), 1);
});
