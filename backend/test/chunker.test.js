import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chunkText, chunkPages } from "../src/services/chunker.js";

function words(n, prefix = "word") {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
}

describe("chunkText", () => {
  test("returns a single chunk for short text", () => {
    const chunks = chunkText("just a few words here", 500, 50);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0], "just a few words here");
  });

  test("splits long text into multiple overlapping chunks", () => {
    const text = words(1200);
    const chunks = chunkText(text, 500, 50);
    assert.ok(chunks.length > 1);
    // consecutive chunks should share overlap words
    const firstChunkWords = chunks[0].split(" ");
    const secondChunkWords = chunks[1].split(" ");
    const overlapCandidate = firstChunkWords[firstChunkWords.length - 1];
    assert.ok(secondChunkWords.includes(overlapCandidate));
  });

  test("returns no chunks for empty text", () => {
    const chunks = chunkText("", 500, 50);
    assert.equal(chunks.length, 0);
  });

  test("handles text shorter than the overlap without infinite looping", () => {
    const chunks = chunkText("one two three", 500, 50);
    assert.equal(chunks.length, 1);
  });
});

describe("chunkPages", () => {
  test("tags each chunk with the page it came from", () => {
    const pages = ["page one content", "page two content", "page three content"];
    const chunks = chunkPages(pages, 500, 50);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].page, 1);
    assert.equal(chunks[1].page, 2);
    assert.equal(chunks[2].page, 3);
  });

  test("never lets a chunk span two pages, even with long pages", () => {
    const pages = [words(600, "p1w"), words(600, "p2w")];
    const chunks = chunkPages(pages, 500, 50);
    const page1Chunks = chunks.filter((c) => c.page === 1);
    const page2Chunks = chunks.filter((c) => c.page === 2);
    assert.ok(page1Chunks.length >= 1);
    assert.ok(page2Chunks.length >= 1);
    // no chunk should contain words from both pages
    for (const c of chunks) {
      assert.ok(!(c.text.includes("p1w") && c.text.includes("p2w")));
    }
  });

  test("skips blank pages instead of producing empty chunks", () => {
    const pages = ["real content here", "   ", ""];
    const chunks = chunkPages(pages, 500, 50);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].page, 1);
  });
});
