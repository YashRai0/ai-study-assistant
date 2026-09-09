import test from "node:test";
import assert from "node:assert/strict";
import { removeCyclicPrerequisiteEdges } from "../src/services/learningPipeline.js";

test("keeps a plain acyclic chain unchanged", () => {
  const edges = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["C"])],
    ["C", new Set()],
  ]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  assert.deepEqual(dropped, []);
  assert.deepEqual([...kept.get("A")], ["B"]);
  assert.deepEqual([...kept.get("B")], ["C"]);
  assert.deepEqual([...kept.get("C")], []);
});

test("drops the edge that closes a 3-node cycle, keeping the rest of the graph intact", () => {
  // A requires B, B requires C, C requires A (the closing edge) — plus an
  // unrelated D requires A, which shouldn't be affected.
  const edges = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["C"])],
    ["C", new Set(["A"])],
    ["D", new Set(["A"])],
  ]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  assert.deepEqual(dropped, [{ concept: "C", prerequisite: "A" }]);
  assert.deepEqual([...kept.get("A")], ["B"]);
  assert.deepEqual([...kept.get("B")], ["C"]);
  assert.deepEqual([...kept.get("C")], []);
  assert.deepEqual([...kept.get("D")], ["A"]);
});

test("drops a direct two-node mutual cycle (A requires B, B requires A)", () => {
  const edges = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["A"])],
  ]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  // Processed in Map insertion order, so A->B is established first and
  // B->A is the one that would close the loop.
  assert.deepEqual(dropped, [{ concept: "B", prerequisite: "A" }]);
  assert.deepEqual([...kept.get("A")], ["B"]);
  assert.deepEqual([...kept.get("B")], []);
});

test("a concept can't be recorded as its own prerequisite via a longer loop", () => {
  // A -> B -> C -> D -> B (loop not touching A at all) — the earlier A->B
  // edge should be untouched since it isn't part of the cycle.
  const edges = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["C"])],
    ["C", new Set(["D"])],
    ["D", new Set(["B"])],
  ]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  assert.deepEqual(dropped, [{ concept: "D", prerequisite: "B" }]);
  assert.deepEqual([...kept.get("A")], ["B"]);
  assert.deepEqual([...kept.get("D")], []);
});

test("multiple independent cycles are each broken once", () => {
  const edges = new Map([
    ["A", new Set(["B"])],
    ["B", new Set(["A"])], // cycle 1
    ["X", new Set(["Y"])],
    ["Y", new Set(["X"])], // cycle 2, unrelated to cycle 1
  ]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  assert.equal(dropped.length, 2);
  assert.ok(dropped.some((d) => d.concept === "B" && d.prerequisite === "A"));
  assert.ok(dropped.some((d) => d.concept === "Y" && d.prerequisite === "X"));
});

test("a concept with no prerequisites at all produces an empty kept set, not an error", () => {
  const edges = new Map([["A", new Set()]]);

  const { kept, dropped } = removeCyclicPrerequisiteEdges(edges);

  assert.deepEqual(dropped, []);
  assert.deepEqual([...kept.get("A")], []);
});
