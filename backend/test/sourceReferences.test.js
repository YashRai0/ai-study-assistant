import test from "node:test";
import assert from "node:assert/strict";
import { findSourceReferences } from "../src/services/learningPipeline.js";

test("finds a single PDF that mentions the concept by name", () => {
  const pdfs = [
    { _id: "pdf1", fullText: "This chapter covers Glycolysis in detail." },
    { _id: "pdf2", fullText: "This chapter is about the water cycle." },
  ];
  const refs = findSourceReferences("Glycolysis", [], pdfs);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].sourceId, "pdf1");
});

test("finds every PDF that mentions the concept — the actual cross-source synthesis fix", () => {
  const pdfs = [
    { _id: "pdf1", fullText: "Photosynthesis converts light into chemical energy." },
    { _id: "pdf2", fullText: "Lecture notes: Photosynthesis occurs in the chloroplast." },
    { _id: "pdf3", fullText: "Unrelated content about world history." },
  ];
  const refs = findSourceReferences("Photosynthesis", [], pdfs);
  const sourceIds = refs.map((r) => r.sourceId);
  assert.deepEqual(sourceIds.sort(), ["pdf1", "pdf2"]);
});

test("matches via an alias even when the canonical name isn't present", () => {
  const pdfs = [{ _id: "pdf1", fullText: "The Krebs Cycle is central to cellular respiration." }];
  const refs = findSourceReferences("Citric Acid Cycle", ["Krebs Cycle"], pdfs);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].sourceId, "pdf1");
});

test("matching is case-insensitive", () => {
  const pdfs = [{ _id: "pdf1", fullText: "GLYCOLYSIS is the first step." }];
  const refs = findSourceReferences("glycolysis", [], pdfs);
  assert.equal(refs.length, 1);
});

test("no matches returns an empty array, not null or undefined", () => {
  const pdfs = [{ _id: "pdf1", fullText: "Nothing relevant here." }];
  const refs = findSourceReferences("Mitochondria", [], pdfs);
  assert.deepEqual(refs, []);
});

test("a concept name with no PDFs at all returns an empty array", () => {
  assert.deepEqual(findSourceReferences("Anything", [], []), []);
});
