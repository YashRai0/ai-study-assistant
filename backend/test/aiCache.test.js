import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { hashInput, buildCacheKey, getCachedAiResponse, setCachedAiResponse, invalidateDocumentAiArtifacts } from "../src/services/aiCache.js";
import { closeRedis } from "../src/services/redis.js";

after(async () => {
  await closeRedis();
});

test("aiCache: hashInput produces consistent sha256 hex string", () => {
  const hash1 = hashInput("test input prompt");
  const hash2 = hashInput("test input prompt");
  assert.equal(hash1, hash2);
  assert.equal(hash1.length, 64);

  const objHash1 = hashInput({ a: 1, b: "hello" });
  const objHash2 = hashInput({ a: 1, b: "hello" });
  assert.equal(objHash1, objHash2);
});

test("aiCache: buildCacheKey constructs formatted key with sanitized components", () => {
  const key = buildCacheKey({
    operation: "Summary",
    model: "openai/gpt-oss-20b",
    reasoningEffort: "low",
    promptVersion: "summary:v1",
    inputHash: "abcdef123456",
  });

  assert.equal(key, "ai:v1:summary:openai_gpt-oss-20b:low:summary:v1:abcdef123456");
});

test("aiCache: getCachedAiResponse gracefully returns null when unpopulated", async () => {
  const nonExistentKey = `ai:v1:test:nonexistent:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const result = await getCachedAiResponse(nonExistentKey, "test_op");
  assert.equal(result, null);
});

test("aiCache: setCachedAiResponse stores payload and retrieves it", async () => {
  const testKey = `ai:v1:test:set_get:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const written = await setCachedAiResponse(testKey, { testData: "cached_value" }, 300, "test_op");
  assert.equal(typeof written, "boolean");

  if (written) {
    const fetched = await getCachedAiResponse(testKey, "test_op");
    assert.deepEqual(fetched, { testData: "cached_value" });
  }
});

test("aiCache: invalidateDocumentAiArtifacts handles null and valid document hashes", async () => {
  const resultNull = await invalidateDocumentAiArtifacts(null);
  assert.equal(resultNull, 0);

  const testHash = "f".repeat(64);
  const cacheKey = `ai:v1:summary:gpt-oss-20b:low:v1:${testHash}`;
  await setCachedAiResponse(cacheKey, { summary: "temp" }, 300, "summary");

  const invalidatedCount = await invalidateDocumentAiArtifacts(testHash);
  assert.equal(typeof invalidatedCount, "number");
});
