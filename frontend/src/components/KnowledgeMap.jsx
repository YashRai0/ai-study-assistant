import { useEffect, useMemo, useState } from "react";
import client from "../api/client.js";

function masteryColor(m) {
  if (m >= 0.8) return "#10b981"; // green
  if (m >= 0.5) return "#f59e0b"; // yellow
  return "#d1d5db"; // gray
}

function masteryLabel(m) {
  return m >= 0.8 ? "Mastered" : m >= 0.5 ? "Learning" : "Not started";
}

/** Small pill used for both prerequisites and "unlocks" — same shape,
 * just a different list, so one component covers both directions of the
 * chain instead of duplicating the markup. */
function ChainNode({ concept, mastery }) {
  const m = mastery[concept._id] || 0;
  return (
    <div
      className="min-w-[8rem] max-w-[10rem] shrink-0 rounded-lg border p-2 text-center"
      style={{ borderColor: masteryColor(m) }}
      title={`${concept.name}: ${Math.round(m * 100)}% (${masteryLabel(m)})`}
    >
      <p className="truncate text-xs font-medium text-ink-900">{concept.name}</p>
      <p className="text-xs" style={{ color: masteryColor(m) }}>{Math.round(m * 100)}%</p>
    </div>
  );
}

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

  const getMasteryColor = (conceptId) => masteryColor(mastery[conceptId] || 0);

  // The backend only ever gives each concept its own prerequisites/
  // dependsOn list — nothing tells you what a concept *unlocks* (the
  // reverse direction), which is exactly the other half of "prerequisite
  // chain → current concept → next concept" the flat list was missing.
  // Computed client-side from the same data already loaded, rather than
  // adding a new endpoint just to invert a list that's already in memory.
  const dependentsByConceptId = useMemo(() => {
    const map = new Map();
    for (const concept of concepts) {
      const upstream = [...(concept.prerequisites || []), ...(concept.dependsOn || [])];
      for (const prereq of upstream) {
        const list = map.get(prereq._id) || [];
        list.push(concept);
        map.set(prereq._id, list);
      }
    }
    return map;
  }, [concepts]);

  if (loading) return <p className="text-ink-400">Loading knowledge map…</p>;
  if (!concepts.length) return <p className="text-ink-400">No concepts yet.</p>;

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-6">
      <h2 className="font-display text-lg font-semibold text-ink-900">Knowledge Map</h2>
      <div className="mt-4 grid gap-2">
        {concepts.sort((a, b) => (b.importance || 0) - (a.importance || 0)).map((c) => {
          const m = mastery[c._id] || 0;
          const label = masteryLabel(m);
          const isSelected = selected === c._id;
          const unlocks = dependentsByConceptId.get(c._id) || [];
          return (
            <div
              key={c._id}
              onClick={() => setSelected(isSelected ? null : c._id)}
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
              {isSelected && (
                <div className="mt-2 border-t border-ink-100 pt-2">
                  <p className="text-xs text-ink-600">{c.description || "No description."}</p>

                  {(c.prerequisites?.length > 0 || unlocks.length > 0) && (
                    <div className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1">
                      <div className="flex shrink-0 flex-col gap-1">
                        {c.prerequisites?.length > 0 ? (
                          c.prerequisites.map((p) => <ChainNode key={p._id} concept={p} mastery={mastery} />)
                        ) : (
                          <div className="flex min-w-[8rem] items-center justify-center rounded-lg border border-dashed p-2 text-center text-xs text-ink-300">
                            No prerequisites
                          </div>
                        )}
                      </div>
                      <span className="flex items-center text-ink-300" aria-hidden="true">→</span>
                      <div
                        className="flex min-w-[8rem] max-w-[10rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 p-2 text-center"
                        style={{ borderColor: getMasteryColor(c._id) }}
                      >
                        <p className="truncate text-xs font-semibold text-ink-900">{c.name}</p>
                        <p className="text-xs" style={{ color: getMasteryColor(c._id) }}>{Math.round(m * 100)}%</p>
                      </div>
                      <span className="flex items-center text-ink-300" aria-hidden="true">→</span>
                      <div className="flex shrink-0 flex-col gap-1">
                        {unlocks.length > 0 ? (
                          unlocks.map((u) => <ChainNode key={u._id} concept={u} mastery={mastery} />)
                        ) : (
                          <div className="flex min-w-[8rem] items-center justify-center rounded-lg border border-dashed p-2 text-center text-xs text-ink-300">
                            Nothing yet
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {c.sourceRefs?.length > 1 && (
                    <p className="mt-2 text-xs text-sage">
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
