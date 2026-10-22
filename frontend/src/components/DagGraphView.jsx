import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { computeDagLayout } from "../utils/dagLayout.js";

export default function DagGraphView({
  concepts,
  mastery,
  misconceptions = {},
  selectedId,
  onSelectConcept,
}) {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  const { nodes, edges, width, height } = useMemo(() => {
    return computeDagLayout(concepts, mastery);
  }, [concepts, mastery]);

  // Handle pan drag
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // left click only
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove]);

  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setZoom((z) => Math.min(2.0, Math.max(0.45, z * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Connected edges for hover highlighting
  const connectedEdgeSet = useMemo(() => {
    if (!hoveredNodeId) return null;
    const set = new Set();
    for (const e of edges) {
      if (e.sourceId === hoveredNodeId || e.targetId === hoveredNodeId) {
        set.add(e.id);
      }
    }
    return set;
  }, [hoveredNodeId, edges]);

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-paper/30 shadow-2xs">
      {/* Top Floating Controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 rounded-full border border-ink-100 bg-white/90 p-1 shadow-md backdrop-blur-md">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.0, z + 0.15))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-ink-700 hover:bg-ink-100 transition"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <span className="px-1 text-[11px] font-semibold text-ink-500">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.45, z - 0.15))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-ink-700 hover:bg-ink-100 transition"
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <div className="h-4 w-px bg-ink-200" />
        <button
          type="button"
          onClick={resetView}
          className="flex h-7 px-2.5 items-center justify-center rounded-full text-[11px] font-semibold text-ink-700 hover:bg-ink-100 transition"
          title="Reset zoom & position"
        >
          Reset ⟲
        </button>
      </div>

      {/* SVG Canvas Container */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        className={`h-[480px] w-full overflow-hidden select-none ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
        >
          <defs>
            {/* Arrow Marker Definitions */}
            <marker
              id="dag-arrow-default"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#cbd5e1" />
            </marker>

            <marker
              id="dag-arrow-mastered"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#10b981" />
            </marker>

            <marker
              id="dag-arrow-active"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#4f46e5" />
            </marker>

            {/* Filter Shadow */}
            <filter id="node-shadow" x="-8%" y="-8%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.06" />
            </filter>
          </defs>

          {/* Grid Background Pattern */}
          <pattern id="graph-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#e2e8f0" />
          </pattern>
          <rect width={width} height={height} fill="url(#graph-grid)" opacity="0.7" />

          {/* Render Connections */}
          <g className="edges">
            {edges.map((e) => {
              const isHighlighted = connectedEdgeSet ? connectedEdgeSet.has(e.id) : false;
              const isDimmed = connectedEdgeSet && !isHighlighted;
              const isSourceMastered = e.sourceMastery >= 0.8;

              let strokeColor = isSourceMastered ? "#10b981" : "#94a3b8";
              let marker = isSourceMastered ? "url(#dag-arrow-mastered)" : "url(#dag-arrow-default)";

              if (isHighlighted) {
                strokeColor = "#4f46e5";
                marker = "url(#dag-arrow-active)";
              }

              return (
                <path
                  key={e.id}
                  d={e.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={!isSourceMastered && !isHighlighted ? "4 4" : undefined}
                  markerEnd={marker}
                  opacity={isDimmed ? 0.15 : 0.85}
                  className="transition-all duration-200"
                />
              );
            })}
          </g>

          {/* Render Nodes */}
          <g className="nodes">
            {nodes.map((node) => {
              const isSelected = selectedId === node.id;
              const isHovered = hoveredNodeId === node.id;
              const hasMisc = Boolean(misconceptions[node.id]);
              const masteryVal = node.mastery;

              const statusColor =
                masteryVal >= 0.8 ? "#10b981" : masteryVal >= 0.5 ? "#f59e0b" : "#94a3b8";

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectConcept) onSelectConcept(node.concept);
                  }}
                  onMouseEnter={() => setHoveredNodeId(node.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  className="cursor-pointer transition-transform duration-150"
                  style={{
                    transform: isHovered || isSelected ? `translate(${node.x}px, ${node.y - 2}px)` : undefined,
                  }}
                >
                  {/* Card Body */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="12"
                    fill="#ffffff"
                    stroke={isSelected ? "#4f46e5" : isHovered ? "#94a3b8" : "#e2e8f0"}
                    strokeWidth={isSelected ? 2.5 : 1}
                    filter="url(#node-shadow)"
                  />

                  {/* Left Status Stripe */}
                  <path
                    d={`M 1 12 Q 1 1 12 1 L 14 1 L 14 ${node.height - 1} L 12 ${node.height - 1} Q 1 ${node.height - 1} 1 ${node.height - 12} Z`}
                    fill={statusColor}
                  />

                  {/* Concept Name */}
                  <text
                    x="22"
                    y="24"
                    fontSize="11"
                    fontWeight="700"
                    fill="#0f172a"
                    className="select-none font-display"
                  >
                    {node.concept.name.length > 18
                      ? `${node.concept.name.slice(0, 17)}…`
                      : node.concept.name}
                  </text>

                  {/* Subtitle / Mastery Badge */}
                  <g transform="translate(22, 33)">
                    <rect
                      width="42"
                      height="16"
                      rx="8"
                      fill={statusColor}
                      opacity="0.12"
                    />
                    <text
                      x="21"
                      y="11.5"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill={statusColor}
                    >
                      {Math.round(masteryVal * 100)}%
                    </text>
                  </g>

                  {/* Prereq / Misconception Icon */}
                  {hasMisc && (
                    <g transform={`translate(${node.width - 24}, 8)`}>
                      <circle cx="8" cy="8" r="8" fill="#fee2e2" />
                      <text x="8" y="11" textAnchor="middle" fontSize="9">⚠️</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Legend & Instructions Footer */}
      <div className="flex flex-wrap items-center justify-between border-t border-ink-100/80 bg-white/90 px-4 py-2 text-xs text-ink-500 backdrop-blur-xs">
        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Mastered (80%+)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>In Progress (50-79%)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Foundational / Blocked</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Active Misconception</span>
          </span>
        </div>

        <span className="text-[10px] text-ink-400 hidden sm:inline">
          Drag to pan · Scroll to zoom · Click node to inspect
        </span>
      </div>
    </div>
  );
}
