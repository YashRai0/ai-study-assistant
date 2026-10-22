export function computeDagLayout(concepts, mastery = {}, options = {}) {
  const nodeWidth = options.nodeWidth || 170;
  const nodeHeight = options.nodeHeight || 58;
  const colGap = options.colGap || 90;
  const rowGap = options.rowGap || 26;
  const padX = options.padX || 40;
  const padY = options.padY || 40;

  if (!concepts || concepts.length === 0) {
    return { nodes: [], edges: [], width: 400, height: 300, layers: [] };
  }

  const conceptMap = new Map(concepts.map((c) => [c._id, c]));
  const depthMap = new Map();

  function getDepth(id, visited = new Set()) {
    if (depthMap.has(id)) return depthMap.get(id);
    if (visited.has(id)) return 0; // cycle fallback
    visited.add(id);

    const c = conceptMap.get(id);
    if (!c || !c.prerequisites || c.prerequisites.length === 0) {
      depthMap.set(id, 0);
      return 0;
    }

    let maxPrereqDepth = -1;
    for (const p of c.prerequisites) {
      const pId = typeof p === "object" ? p._id : p;
      maxPrereqDepth = Math.max(maxPrereqDepth, getDepth(pId, new Set(visited)));
    }
    const depth = maxPrereqDepth + 1;
    depthMap.set(id, depth);
    return depth;
  }

  for (const c of concepts) {
    getDepth(c._id);
  }

  // Group nodes by depth layer
  const layerMap = new Map();
  for (const c of concepts) {
    const d = depthMap.get(c._id) || 0;
    if (!layerMap.has(d)) layerMap.set(d, []);
    layerMap.get(d).push(c);
  }

  // Sort layers
  const sortedLayers = Array.from(layerMap.entries()).sort(([a], [b]) => a - b);

  let maxRows = 0;
  sortedLayers.forEach(([, nodesInLayer]) => {
    maxRows = Math.max(maxRows, nodesInLayer.length);
  });

  const nodes = [];
  const nodePositions = new Map();

  sortedLayers.forEach(([layerIdx, nodesInLayer]) => {
    const x = padX + layerIdx * (nodeWidth + colGap);

    nodesInLayer.forEach((concept, rowIdx) => {
      const y = padY + rowIdx * (nodeHeight + rowGap);
      const m = mastery[concept._id] || 0;

      const nodeData = {
        id: concept._id,
        concept,
        x,
        y,
        width: nodeWidth,
        height: nodeHeight,
        layer: layerIdx,
        mastery: m,
      };

      nodes.push(nodeData);
      nodePositions.set(concept._id, nodeData);
    });
  });

  // Build curved bezier edges
  const edges = [];
  for (const targetNode of nodes) {
    const prereqs = targetNode.concept.prerequisites || [];
    for (const p of prereqs) {
      const pId = typeof p === "object" ? p._id : p;
      const sourceNode = nodePositions.get(pId);
      if (sourceNode) {
        const x1 = sourceNode.x + sourceNode.width;
        const y1 = sourceNode.y + sourceNode.height / 2;
        const x2 = targetNode.x;
        const y2 = targetNode.y + targetNode.height / 2;

        const deltaX = Math.max(30, (x2 - x1) / 2);
        const path = `M ${x1} ${y1} C ${x1 + deltaX} ${y1}, ${x2 - deltaX} ${y2}, ${x2} ${y2}`;

        edges.push({
          id: `${sourceNode.id}->${targetNode.id}`,
          sourceId: sourceNode.id,
          targetId: targetNode.id,
          path,
          sourceMastery: sourceNode.mastery,
          targetMastery: targetNode.mastery,
        });
      }
    }
  }

  const numCols = sortedLayers.length || 1;
  const width = Math.max(600, padX * 2 + numCols * nodeWidth + (numCols - 1) * colGap);
  const height = Math.max(400, padY * 2 + maxRows * nodeHeight + (maxRows - 1) * rowGap);

  return { nodes, edges, width, height, layers: sortedLayers };
}
