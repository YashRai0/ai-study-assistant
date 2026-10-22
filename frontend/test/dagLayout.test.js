import test from "node:test";
import assert from "node:assert/strict";
import { computeDagLayout } from "../src/utils/dagLayout.js";

test("computeDagLayout: handles empty concepts gracefully", () => {
  const result = computeDagLayout([]);
  assert.equal(result.nodes.length, 0);
  assert.equal(result.edges.length, 0);
  assert.ok(result.width >= 400);
  assert.ok(result.height >= 300);
});

test("computeDagLayout: stratifies nodes into topological layers correctly", () => {
  const concepts = [
    { _id: "c1", name: "Variables", prerequisites: [] },
    { _id: "c2", name: "Loops", prerequisites: [{ _id: "c1" }] },
    { _id: "c3", name: "Functions", prerequisites: [{ _id: "c1" }] },
    { _id: "c4", name: "Recursion", prerequisites: [{ _id: "c3" }] },
  ];

  const mastery = { c1: 0.9, c2: 0.6, c3: 0.85, c4: 0.2 };
  const layout = computeDagLayout(concepts, mastery);

  assert.equal(layout.nodes.length, 4);

  const nodeC1 = layout.nodes.find((n) => n.id === "c1");
  const nodeC2 = layout.nodes.find((n) => n.id === "c2");
  const nodeC3 = layout.nodes.find((n) => n.id === "c3");
  const nodeC4 = layout.nodes.find((n) => n.id === "c4");

  // Layer checks: Root is 0, children are 1, grandchild is 2
  assert.equal(nodeC1.layer, 0);
  assert.equal(nodeC2.layer, 1);
  assert.equal(nodeC3.layer, 1);
  assert.equal(nodeC4.layer, 2);

  // Position checks: X coordinate strictly increases by layer
  assert.ok(nodeC1.x < nodeC2.x);
  assert.equal(nodeC2.x, nodeC3.x);
  assert.ok(nodeC3.x < nodeC4.x);
});

test("computeDagLayout: generates curved bezier paths between connected nodes", () => {
  const concepts = [
    { _id: "a", name: "Algebra", prerequisites: [] },
    { _id: "b", name: "Calculus", prerequisites: ["a"] },
  ];
  const layout = computeDagLayout(concepts, { a: 1.0 });

  assert.equal(layout.edges.length, 1);
  const edge = layout.edges[0];
  assert.equal(edge.sourceId, "a");
  assert.equal(edge.targetId, "b");
  assert.ok(edge.path.startsWith("M "));
  assert.ok(edge.path.includes(" C "));
});

test("computeDagLayout: handles cyclical or recursive prerequisites without crashing", () => {
  const concepts = [
    { _id: "c1", name: "Alpha", prerequisites: [{ _id: "c2" }] },
    { _id: "c2", name: "Beta", prerequisites: [{ _id: "c1" }] },
  ];

  // Must not throw maximum call stack size exceeded
  assert.doesNotThrow(() => {
    const layout = computeDagLayout(concepts);
    assert.equal(layout.nodes.length, 2);
  });
});
