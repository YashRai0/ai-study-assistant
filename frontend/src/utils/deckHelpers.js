/**
 * Deck management, export, and spaced review helpers
 */

export function exportDeckToCsv(cards = []) {
  if (!cards || cards.length === 0) return "";
  const header = `"Front","Back","Subject"`;
  const rows = cards.map((c) => {
    const front = `"${(c.front || "").replace(/"/g, '""')}"`;
    const back = `"${(c.back || "").replace(/"/g, '""')}"`;
    const subject = `"${(c.subject || "").replace(/"/g, '""')}"`;
    return `${front},${back},${subject}`;
  });
  return [header, ...rows].join("\r\n");
}

export function exportDeckToJson(cards = [], deckName = "Prepnexia Deck") {
  return JSON.stringify(
    {
      deckName,
      exportedAt: new Date().toISOString(),
      cardCount: cards.length,
      cards: cards.map((c, i) => ({
        id: c._id || `card-${i + 1}`,
        front: c.front,
        back: c.back,
        subject: c.subject || "General",
      })),
    },
    null,
    2
  );
}

export function calculateDeckRetentionMetrics(cards = []) {
  const total = cards.length;
  if (total === 0) {
    return { total: 0, estimatedMinutes: 0, subjects: [] };
  }

  const subjectCounts = {};
  cards.forEach((c) => {
    const s = c.subject || "General";
    subjectCounts[s] = (subjectCounts[s] || 0) + 1;
  });

  const subjects = Object.entries(subjectCounts).map(([name, count]) => ({
    name,
    count,
    percentage: Math.round((count / total) * 100),
  }));

  // Average 15 seconds per flashcard
  const estimatedMinutes = Math.max(1, Math.round((total * 15) / 60));

  return {
    total,
    estimatedMinutes,
    subjects,
  };
}

export function filterCardsByQuery(cards = [], query = "") {
  if (!query || !query.trim()) return cards;
  const q = query.toLowerCase().trim();
  return cards.filter(
    (c) =>
      (c.front && c.front.toLowerCase().includes(q)) ||
      (c.back && c.back.toLowerCase().includes(q)) ||
      (c.subject && c.subject.toLowerCase().includes(q))
  );
}
