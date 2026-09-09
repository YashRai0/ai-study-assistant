import test from "node:test";
import assert from "node:assert/strict";
import { rankEvidenceChunks } from "../src/services/evidenceRanking.js";

test("evidence ranking finds paraphrased concept support through token overlap", () => {
  const chunks = [
    { _id: "1", page: 2, text: "Oxidation occurs when a molecule loses electrons during a chemical reaction." },
    { _id: "2", page: 8, text: "Photosynthesis converts light energy into chemical energy in plants." },
  ];
  const ranked = rankEvidenceChunks({ conceptName: "Oxidation", aliases: ["electron loss"], chunks });
  assert.equal(ranked[0].chunk._id, "1");
});

test("evidence ranking supports morphology without requiring exact phrase", () => {
  const chunks = [
    { _id: "1", page: 4, text: "Cells oxidize glucose through a sequence of metabolic reactions." },
    { _id: "2", page: 5, text: "The cell membrane controls movement of substances." },
  ];
  const ranked = rankEvidenceChunks({ conceptName: "Oxidation", aliases: [], chunks });
  assert.equal(ranked[0].chunk._id, "1");
});

test("evidence ranking rejects generic single-word overlap", () => {
  const chunks = [
    { _id: "1", page: 1, text: "This example describes a general process and answer." },
    { _id: "2", page: 2, text: "Mitochondria generate ATP through oxidative phosphorylation." },
  ];
  const ranked = rankEvidenceChunks({ conceptName: "ATP synthesis", aliases: [], chunks });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].chunk._id, "2");
});
