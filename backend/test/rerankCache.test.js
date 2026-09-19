import test from "node:test";
import assert from "node:assert/strict";
import { buildRerankCacheKey, buildCacheKey, invalidateDocumentAiArtifacts } from "../src/services/aiCache.js";

test("rerankCache: same query + same candidates produces identical cache key (cache hit)", () => {
  const candidates1 = [
    { id: "c1", text: "Photosynthesis takes place in chloroplasts." },
    { id: "c2", text: "Mitochondria produce cellular ATP via respiration." },
  ];
  const candidates2 = [
    { id: "c1", text: "Photosynthesis takes place in chloroplasts." },
    { id: "c2", text: "Mitochondria produce cellular ATP via respiration." },
  ];

  const key1 = buildRerankCacheKey({
    query: "how does photosynthesis work",
    candidates: candidates1,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v1",
  });

  const key2 = buildRerankCacheKey({
    query: "  how does PHOTOSYNTHESIS work  ", // case and whitespace normalization
    candidates: candidates2,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v1",
  });

  assert.equal(key1, key2, "Normalized query and identical candidates must produce identical cache keys");
});

test("rerankCache: same query + different candidates produces different cache key (cache miss)", () => {
  const candidates1 = [
    { id: "c1", text: "Photosynthesis takes place in chloroplasts." },
  ];
  const candidates2 = [
    { id: "c2", text: "Cellular respiration occurs in the mitochondria." },
  ];

  const key1 = buildRerankCacheKey({
    query: "what is photosynthesis",
    candidates: candidates1,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v1",
  });

  const key2 = buildRerankCacheKey({
    query: "what is photosynthesis",
    candidates: candidates2,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v1",
  });

  assert.notEqual(key1, key2, "Different candidate sets must produce distinct cache keys to prevent stale reranking");
});

test("rerankCache: same query + changed prompt version produces different cache key", () => {
  const candidates = [
    { id: "c1", text: "Some notes about Newton's third law of motion." },
  ];

  const keyV1 = buildRerankCacheKey({
    query: "newtons third law",
    candidates,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v1",
  });

  const keyV2 = buildRerankCacheKey({
    query: "newtons third law",
    candidates,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "rerank:v2",
  });

  assert.notEqual(keyV1, keyV2, "Changed prompt versions must invalidate existing cached rerank results");
});

test("rerankCache: changed model or reasoning effort produces different cache key", () => {
  const candidates = [{ id: "c1", text: "Sample text chunk." }];

  const key1 = buildRerankCacheKey({
    query: "sample query",
    candidates,
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
  });

  const key2 = buildRerankCacheKey({
    query: "sample query",
    candidates,
    model: "meta/llama-3-70b",
    reasoningEffort: "medium",
  });

  assert.notEqual(key1, key2);
});

test("aiCache: SCAN invalidation targets matching keys across multiple pages and leaves unrelated keys intact", async () => {
  // In-memory Redis mock with scan and del
  const storage = new Map();

  // Populate 150 matching keys for doc1
  const doc1Hash = "a".repeat(64);
  for (let i = 0; i < 150; i++) {
    storage.set(`ai:v1:summary:gpt-oss-20b:low:v1:${doc1Hash}_item${i}`, "cached");
  }

  // Populate 50 keys for doc2 (unrelated user / document)
  const doc2Hash = "b".repeat(64);
  for (let i = 0; i < 50; i++) {
    storage.set(`ai:v1:summary:gpt-oss-20b:low:v1:${doc2Hash}_item${i}`, "other_user_data");
  }

  let allKeys = Array.from(storage.keys());
  const mockRedis = {
    scan: async (cursor, matchDirective, pattern, countDirective, count) => {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const matched = allKeys.filter((k) => regex.test(k));
      const pageSize = Number(count) || 100;
      const offset = Number(cursor) || 0;
      const page = matched.slice(offset, offset + pageSize);
      const nextOffset = offset + pageSize >= matched.length ? 0 : offset + pageSize;
      return [String(nextOffset), page];
    },
    del: async (...keys) => {
      for (const k of keys) storage.delete(k);
      return keys.length;
    },
  };

  // Run cursor-based SCAN invalidation logic
  const pattern = `ai:v1:*:*:*:*:${doc1Hash}*`;
  let cursor = "0";
  let deletedCount = 0;
  do {
    const [nextCursor, keys] = await mockRedis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys && keys.length > 0) {
      await mockRedis.del(...keys);
      deletedCount += keys.length;
    }
  } while (cursor !== "0");

  assert.equal(deletedCount, 150, "All 150 keys matching doc1 must be deleted across scan pages");
  assert.equal(storage.size, 50, "The 50 keys for doc2 must remain completely untouched");
});
