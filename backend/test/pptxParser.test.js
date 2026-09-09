import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractTextFromPptx } from "../src/services/pptxParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "integration", "fixtures");

test("extracts real text from an actual .pptx file, one page per slide", async () => {
  const buffer = readFileSync(join(fixturesDir, "minimal.pptx"));
  const result = await extractTextFromPptx(buffer, "test-job");

  assert.equal(result.method, "pptx");
  assert.equal(result.pages.length, 2);
  assert.match(result.pages[0], /Photosynthesis/);
  assert.match(result.pages[1], /Cellular Respiration/);
  assert.match(result.fullText, /--- Page 1 ---/);
  assert.match(result.fullText, /--- Page 2 ---/);
});

test("throws a clear error for a .pptx with no readable text", async () => {
  const buffer = readFileSync(join(fixturesDir, "empty.pptx"));
  await assert.rejects(
    () => extractTextFromPptx(buffer, "test-job"),
    /No readable text found/
  );
});

test("throws (not crashes) on a completely invalid buffer", async () => {
  const garbage = Buffer.from("this is not a pptx file at all");
  await assert.rejects(() => extractTextFromPptx(garbage, "test-job"));
});
