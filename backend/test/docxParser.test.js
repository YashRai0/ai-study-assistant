import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractTextFromDocx } from "../src/services/docxParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "integration", "fixtures");

test("extracts real text from an actual .docx file", async () => {
  const buffer = readFileSync(join(fixturesDir, "minimal.docx"));
  const result = await extractTextFromDocx(buffer, "test-job");

  assert.equal(result.method, "docx");
  assert.equal(result.fullText, "Hello world.");
  assert.deepEqual(result.pages, ["Hello world."]);
});

test("throws a clear error for a .docx with no readable text", async () => {
  const buffer = readFileSync(join(fixturesDir, "empty.docx"));
  await assert.rejects(
    () => extractTextFromDocx(buffer, "test-job"),
    /No readable text found/
  );
});

test("throws (not crashes with an unhandled exception) on a completely invalid buffer", async () => {
  const garbage = Buffer.from("this is not a docx file at all");
  await assert.rejects(() => extractTextFromDocx(garbage, "test-job"));
});
