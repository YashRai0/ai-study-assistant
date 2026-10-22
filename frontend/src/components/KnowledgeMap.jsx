import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import client from "../api/client.js";
import TutorIntervention from "./TutorIntervention.jsx";

function masteryColor(m) {
  if (m >= 0.8) return "#10b981"; // green
  if (m >= 0.5) return "#f59e0b"; // yellow
  return "#94a3b8"; // slate
}

function masteryLabel(m) {
  return m >= 0.8 ? "Mastered" : m >= 0.5 ? "Learning" : "Not started";
}

function ChainNode({ concept, mastery }) {
  const m = mastery[concept._id] || 0;
  return (
    <div
      className="min-w-[7.5rem] max-w-[9.5rem] shrink-0 rounded-lg border border-ink-100 bg-white p-2 text-center shadow-2xs"
      style={{ borderLeftColor: masteryColor(m), borderLeftWidth: "3px" }}
      title={`${concept.name}: ${Math.round(m * 100)}% (${masteryLabel(m)})`}
    >
      <p className="truncate text-xs font-semibold text-ink-900">{concept.name}</p>
      <p className="text-[11px] font-bold" style={{ color: masteryColor(m) }}>{Math.round(m * 100)}%</p>
    </div>
  );
}

export default function KnowledgeMap({ courseId }) {
  const [concepts, setConcepts] = useState([]);
  const [mastery, setMastery] = useState({});
  const [misconceptions, setMisconceptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [tutorConceptId, setTutorConceptId] = useState(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "ready" | "blocked" | "misconceptions"

  const loadData = useCallback((signal) => {
    if (!courseId) return;
    setLoading(true);

    Promise.all([
      client.get(`/learning/courses/${courseId}/concepts`, signal ? { signal } : {}),
      client.get(`/learning/courses/${courseId}/mastery`, signal ? { signal } : {}),
      client.get(`/learning/courses/${courseId}/misconceptions`, signal ? { signal } : {}).catch(() => ({ data: { misconceptions: [] } })),
    ])
      .then(([{ data: c }, { data: m }, { data: misc }]) => {
        setConcepts(c.concepts || []);
        const masteryMap = {};
        (m.mastery || []).forEach((s) => {
          masteryMap[s.concept._id] = s.mastery;
        });
        setMastery(masteryMap);

        const miscMap = {};
        (misc.misconceptions || []).forEach((item) => {
          const cid = item.concept?._id || item.concept;
          if (cid) miscMap[cid] = item;
        });
        setMisconceptions(miscMap);
      })
      .catch((err) => {
        if (signal?.aborted) return;
        console.error("Error loading knowledge map:", err);
      })
      .finally(() => {
        if (!signal?.aborted) {
          setLoading(false);
        }
      });
  }, [courseId]);

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadData]);

  const getMasteryColor = (conceptId) => masteryColor(mastery[conceptId] || 0);

  // Inverted dependents
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

  // Derived concept states
  const analyzedConcepts = useMemo(() => {
    return concepts.map((c) => {
      const m = mastery[c._id] || 0;
      const weakPrereqs = (c.prerequisites || []).filter((p) => (mastery[p._id] || 0) < 0.5);
      const isBlocked = weakPrereqs.length > 0 && m < 0.5;
      const hasMisconception = Boolean(misconceptions[c._id]);
      const isMastered = m >= 0.8;
      const isReady = !isBlocked && !isMastered;
      return {
        ...c,
        masteryVal: m,
        weakPrereqs,
        isBlocked,
        hasMisconception,
        isMastered,
        isReady,
      };
    });
  }, [concepts, mastery, misconceptions]);

  // Filtered concepts based on search and tab
  const filteredConcepts = useMemo(() => {
    return analyzedConcepts
      .filter((c) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q);
          const matchDesc = (c.description || "").toLowerCase().includes(q);
          if (!matchName && !matchDesc) return false;
        }

        if (filterMode === "ready") return c.isReady;
        if (filterMode === "blocked") return c.isBlocked;
        if (filterMode === "misconceptions") return c.hasMisconception;
        if (filterMode === "mastered") return c.isMastered;
        return true;
      })
      .sort((a, b) => (b.importance || 0) - (a.importance || 0));
  }, [analyzedConcepts, searchQuery, filterMode]);

  // Counts for pills
  const counts = useMemo(() => {
    return {
      all: analyzedConcepts.length,
      ready: analyzedConcepts.filter((c) => c.isReady).length,
      blocked: analyzedConcepts.filter((c) => c.isBlocked).length,
      misconceptions: analyzedConcepts.filter((c) => c.hasMisconception).length,
      mastered: analyzedConcepts.filter((c) => c.isMastered).length,
    };
  }, [analyzedConcepts]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-5 w-40 rounded bg-ink-100 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-ink-50" />
          ))}
        </div>
      </div>
    );
  }

  if (!concepts.length) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-200 bg-white/70 p-8 text-center shadow-sm">
        <span className="text-3xl">🗺️</span>
        <h3 className="mt-2 font-display text-base font-bold text-ink-900">No Concepts Mapped Yet</h3>
        <p className="mt-1 text-xs text-ink-500">
          Upload documents or study materials to extract course concepts and visualize prerequisite paths.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
      {/* Header and Controls */}
      <div className="flex flex-col gap-4 border-b border-ink-100/70 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-ink-900">Knowledge Map</h2>
            <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-700">
              {counts.all}
            </span>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">
            Interactive prerequisite graph and misconception remediation hub.
          </p>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search concepts..."
            className="w-full rounded-xl border border-ink-200 bg-ink-50/50 px-3.5 py-1.5 text-xs text-ink-900 placeholder:text-ink-400 focus:border-ink-900 focus:bg-white focus:outline-hidden transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-400 hover:text-ink-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setFilterMode("all")}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            filterMode === "all"
              ? "bg-ink-900 text-paper shadow-2xs"
              : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
          }`}
        >
          All ({counts.all})
        </button>

        <button
          type="button"
          onClick={() => setFilterMode("ready")}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            filterMode === "ready"
              ? "bg-indigo-900 text-white shadow-2xs"
              : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
          }`}
        >
          Ready to Learn ({counts.ready})
        </button>

        <button
          type="button"
          onClick={() => setFilterMode("blocked")}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            filterMode === "blocked"
              ? "bg-amber-800 text-white shadow-2xs"
              : "border border-amber-200 bg-amber-50/60 text-amber-800 hover:bg-amber-100"
          }`}
        >
          Blocked Prereqs ({counts.blocked})
        </button>

        {counts.misconceptions > 0 && (
          <button
            type="button"
            onClick={() => setFilterMode("misconceptions")}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              filterMode === "misconceptions"
                ? "bg-rose-700 text-white shadow-2xs"
                : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            ⚠️ Misconceptions ({counts.misconceptions})
          </button>
        )}

        <button
          type="button"
          onClick={() => setFilterMode("mastered")}
          className={`rounded-full px-3 py-1 font-semibold transition ${
            filterMode === "mastered"
              ? "bg-emerald-800 text-white shadow-2xs"
              : "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          }`}
        >
          Mastered ({counts.mastered})
        </button>
      </div>

      {/* Concept Grid Container with Smooth Capped Scroll */}
      <div className="mt-4 max-h-[540px] overflow-y-auto pr-1">
        {filteredConcepts.length === 0 ? (
          <div className="py-10 text-center text-xs text-ink-400">
            No concepts match your filter or search query.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredConcepts.map((c) => {
              const m = c.masteryVal;
              const label = masteryLabel(m);
              const isSelected = selected === c._id;
              const unlocks = dependentsByConceptId.get(c._id) || [];
              const activeMisconception = misconceptions[c._id];

              return (
                <div
                  key={c._id}
                  onClick={() => setSelected(isSelected ? null : c._id)}
                  className={`cursor-pointer rounded-xl border border-ink-100 bg-white p-3.5 transition-all hover:border-ink-200 hover:shadow-xs ${
                    isSelected ? "ring-2 ring-indigo-500/30 border-indigo-200 md:col-span-2 shadow-sm" : ""
                  }`}
                  style={{ borderLeftColor: getMasteryColor(c._id), borderLeftWidth: "4px" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate font-semibold text-ink-900 text-sm">{c.name}</p>
                        {c.isBlocked && (
                          <span className="rounded-md bg-amber-100/90 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            Prereq Blocked
                          </span>
                        )}
                        {activeMisconception && (
                          <span className="rounded-md bg-rose-100/90 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                            ⚠️ Misconception
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-ink-400 mt-0.5">{label}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-ink-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round(m * 100)}%`,
                            backgroundColor: getMasteryColor(c._id),
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold text-ink-800 min-w-[2.2rem] text-right">
                        {Math.round(m * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Expanded In-Place Drawer when Clicked */}
                  {isSelected && (
                    <div className="mt-3 border-t border-ink-100/70 pt-3" onClick={(e) => e.stopPropagation()}>
                      <p className="text-xs text-ink-600 leading-relaxed">
                        {c.description || "No description provided."}
                      </p>

                      {/* Active Misconception Warning Card */}
                      {activeMisconception && (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-900">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="font-bold text-rose-800">
                                ⚠️ Persistent misconception recorded:
                              </p>
                              <p className="mt-0.5 text-rose-950 font-medium">
                                "{activeMisconception.description}"
                              </p>
                              {activeMisconception.occurrences > 1 && (
                                <p className="mt-0.5 text-[10px] text-rose-600">
                                  Repeated across {activeMisconception.occurrences} attempts · Severity: {activeMisconception.severity || "medium"}
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setTutorConceptId(c._id)}
                              className="rounded-full bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-rose-800 transition shrink-0"
                            >
                              Confront with AI Tutor →
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Blocked Prerequisite Warning Card */}
                      {c.isBlocked && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <span className="font-bold text-amber-900">
                                ⚠️ Blocked by foundational concept: {c.weakPrereqs[0].name} ({Math.round((mastery[c.weakPrereqs[0]._id] || 0) * 100)}% mastery)
                              </span>
                              <p className="mt-0.5 text-[11px] text-amber-700">
                                Mastering foundational concepts unlocks dependent material with higher retention.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelected(c.weakPrereqs[0]._id)}
                              className="rounded-full bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 transition shrink-0"
                            >
                              Study {c.weakPrereqs[0].name}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Horizontal Prerequisite Chain Visualizer */}
                      {(c.prerequisites?.length > 0 || unlocks.length > 0) && (
                        <div className="mt-3.5 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-400 block mb-2">
                            Prerequisite Chain Flow
                          </span>
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            <div className="flex shrink-0 flex-col gap-1">
                              {c.prerequisites?.length > 0 ? (
                                c.prerequisites.map((p) => <ChainNode key={p._id} concept={p} mastery={mastery} />)
                              ) : (
                                <div className="flex min-w-[7.5rem] items-center justify-center rounded-lg border border-dashed border-ink-200 p-2 text-center text-xs text-ink-400">
                                  Foundational
                                </div>
                              )}
                            </div>

                            <span className="text-ink-400 font-bold" aria-hidden="true">→</span>

                            <div
                              className="flex min-w-[8rem] max-w-[10rem] shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-white p-2 text-center shadow-xs"
                              style={{ borderColor: getMasteryColor(c._id) }}
                            >
                              <p className="truncate text-xs font-bold text-ink-900">{c.name}</p>
                              <p className="text-xs font-bold" style={{ color: getMasteryColor(c._id) }}>{Math.round(m * 100)}%</p>
                            </div>

                            <span className="text-ink-400 font-bold" aria-hidden="true">→</span>

                            <div className="flex shrink-0 flex-col gap-1">
                              {unlocks.length > 0 ? (
                                unlocks.map((u) => <ChainNode key={u._id} concept={u} mastery={mastery} />)
                              ) : (
                                <div className="flex min-w-[7.5rem] items-center justify-center rounded-lg border border-dashed border-ink-200 p-2 text-center text-xs text-ink-400">
                                  Terminal node
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action Bar */}
                      <div className="mt-3.5 flex flex-wrap items-center gap-2 pt-2 border-t border-ink-100">
                        <button
                          type="button"
                          onClick={() => setTutorConceptId(c._id)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-900 px-3.5 py-1.5 text-xs font-semibold text-paper hover:bg-ink-800 transition"
                        >
                          <span>🎓 Practice with AI Tutor</span>
                        </button>
                        <Link
                          to={`/adaptive-study?course=${courseId}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-800 hover:bg-ink-50 transition"
                        >
                          <span>📖 Adaptive Session</span>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Embedded Tutor Modal */}
      {tutorConceptId && (
        <TutorIntervention
          courseId={courseId}
          conceptId={tutorConceptId}
          onClose={() => {
            setTutorConceptId(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
