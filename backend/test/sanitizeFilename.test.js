import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFilename } from "../src/utils/sanitizeFilename.js";

describe("sanitizeFilename", () => {
  test("leaves a normal filename unchanged", () => {
    assert.equal(sanitizeFilename("Chapter 3 Notes.pdf"), "Chapter 3 Notes.pdf");
  });

  test("strips control characters", () => {
    const withControlChar = "notes\u0000.pdf";
    assert.equal(sanitizeFilename(withControlChar), "notes.pdf");
  });

  test("replaces path separators so a filename can't imply a path", () => {
    assert.equal(sanitizeFilename("../../etc/passwd.pdf"), "..-..-etc-passwd.pdf");
    assert.equal(sanitizeFilename("folder\\file.pdf"), "folder-file.pdf");
  });

  test("truncates extremely long filenames", () => {
    const long = "a".repeat(500) + ".pdf";
    const result = sanitizeFilename(long);
    assert.ok(result.length <= 200);
  });

  test("falls back to a default name for empty or non-string input", () => {
    assert.equal(sanitizeFilename(""), "untitled.pdf");
    assert.equal(sanitizeFilename(null), "untitled.pdf");
    assert.equal(sanitizeFilename(undefined), "untitled.pdf");
  });

  test("falls back to a default name when the input is entirely control characters", () => {
    assert.equal(sanitizeFilename("\u0000\u0001\u0002"), "untitled.pdf");
  });
});
