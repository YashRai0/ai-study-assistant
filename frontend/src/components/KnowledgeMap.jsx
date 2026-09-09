import { useEffect, useState } from "react";
import client from "../api/client.js";

export default function KnowledgeMap({ courseId }) {
  const [concepts, setConcepts] = useState([]);
  const [mastery, setMastery] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!courseId) return;
    Promise.all([
      client.get(`/learning/courses/${courseId}/concepts`),
      client.get(`/learning/courses/${courseId}/mastery`),
    ])
      .then(([{ data: c }, { data: m }]) => {
        setConcepts(c.concepts || []);
        const masteryMap = {};
        (m.mastery || []).forEach((s) => {
          masteryMap[s.concept._id] = s.mastery;
        });
        setMastery(masteryMap);
      })
      .finally(() => setLoading(false));
  }, [courseId]);

  const getMasteryColor = (conceptId) => {
    const m = mastery[conceptId] || 0;
    if (m >= 0.8) return "#10b981"; // green
    if (m >= 0.5) return "#f59e0b"; // yellow
    return "#d1d5db"; // gray
  };

  if (loading) return <p className="text-ink-400">Loading knowledge map…</p>;
  if (!concepts.length) return <p className="text-ink-400">No concepts yet.</p>;

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Knowledge Map</h2>
      <div className="mt-4 grid gap-2">
        {concepts.sort((a, b) => (b.importance || 0) - (a.importance || 0)).map((c) => {
          const m = mastery[c._id] || 0;
          const label = m >= 0.8 ? "Mastered" : m >= 0.5 ? "Learning" : "Not started";
          return (
            <div
              key={c._id}
              onClick={() => setSelected(selected === c._id ? null : c._id)}
              className="cursor-pointer rounded-lg border p-3 hover:bg-ink-50"
              style={{ borderLeftColor: getMasteryColor(c._id), borderLeftWidth: "4px" }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-ink-900">{c.name}</p>
                  <p className="text-xs text-ink-400">{label}</p>
                </div>
                <div className="ml-2 flex items-center gap-1">
                  <div className="h-2 w-16 rounded-full bg-ink-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(m * 100)}%`,
                        backgroundColor: getMasteryColor(c._id),
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-ink-900">{Math.round(m * 100)}%</span>
                </div>
              </div>
              {selected === c._id && (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <p className="text-xs text-ink-600">{c.description || "No description."}</p>
                  {c.prerequisites?.length > 0 && (
                    <p className="mt-1 text-xs text-ink-500">
                      Prerequisites: {c.prerequisites.map((p) => p.name || p).join(", ")}
                    </p>
                  )}
                  {c.sourceRefs?.length > 1 && (
                    <p className="mt-1 text-xs text-sage">
                      Appears in {c.sourceRefs.length} of your sources — you don't need to relearn this per
                      document, it's the same concept everywhere it shows up.
                    </p>
                  )}
                  {c.sourceRefs?.length > 0 && (
                    <p className="mt-1 text-xs text-ink-400">
                      From: {c.sourceRefs.map((r) => r.sourceId?.filename || "a source").join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
