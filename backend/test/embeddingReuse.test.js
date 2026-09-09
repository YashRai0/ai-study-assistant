import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { hashChunkText, planEmbeddingReuse } from "../workers/processEmbedChunks.js";
import { ALL_QUEUES } from "../src/services/queues.js";
import { closeRedis } from "../src/services/redis.js";

// Importing processEmbedChunks.js pulls in src/services/queues.js, which
// opens a live Redis connection per BullMQ queue at module-load time even
// though this file only tests pure functions. Without closing them, the
// retrying ioredis connections keep the event loop alive and the test
// runner eventually force-kills this file after its timeout.
after(async () => {
  await Promise.all(ALL_QUEUES.map((queue) => queue.close()));
  await closeRedis();
});

test("hashChunkText is deterministic and sensitive to any change in the text", () => {
  const a = hashChunkText("Photosynthesis converts light energy into chemical energy.");
  const b = hashChunkText("Photosynthesis converts light energy into chemical energy.");
  const c = hashChunkText("Photosynthesis converts light energy into chemical energy!"); // one char different

  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("planEmbeddingReuse: with no prior chunks, everything needs embedding", () => {
  const rawChunks = [
    { text: "chunk one", contentHash: "hash1" },
    { text: "chunk two", contentHash: "hash2" },
  ];

  const { toEmbed, priorByHash } = planEmbeddingReuse(rawChunks, []);

  assert.equal(toEmbed.length, 2);
  assert.equal(priorByHash.size, 0);
});

test("planEmbeddingReuse: chunks whose hash matches a prior chunk are skipped", () => {
  const rawChunks = [
    { text: "unchanged chunk", contentHash: "hash-unchanged" },
    { text: "brand new chunk", contentHash: "hash-new" },
  ];
  const priorChunks = [
    { contentHash: "hash-unchanged", embedding: [0.1, 0.2, 0.3] },
    { contentHash: "hash-stale-no-longer-present", embedding: [0.9, 0.9, 0.9] },
  ];

  const { toEmbed, priorByHash } = planEmbeddingReuse(rawChunks, priorChunks);

  assert.equal(toEmbed.length, 1);
  assert.equal(toEmbed[0].contentHash, "hash-new");
  assert.deepEqual(priorByHash.get("hash-unchanged").embedding, [0.1, 0.2, 0.3]);
});

test("planEmbeddingReuse: a full retry with completely unchanged text needs zero new embeddings", () => {
  const rawChunks = [
    { text: "a", contentHash: "h1" },
    { text: "b", contentHash: "h2" },
    { text: "c", contentHash: "h3" },
  ];
  const priorChunks = rawChunks.map((c) => ({ contentHash: c.contentHash, embedding: [1] }));

  const { toEmbed } = planEmbeddingReuse(rawChunks, priorChunks);

  assert.equal(toEmbed.length, 0);
});

test("planEmbeddingReuse: prior chunks with no contentHash (pre-migration data) are never matched", () => {
  // Chunks embedded before this field existed have contentHash: undefined —
  // they must not accidentally collide with each other or with a real hash.
  const rawChunks = [{ text: "chunk", contentHash: "h1" }];
  const priorChunks = [{ embedding: [1, 2, 3] }, { embedding: [4, 5, 6] }];

  const { toEmbed, priorByHash } = planEmbeddingReuse(rawChunks, priorChunks);

  assert.equal(toEmbed.length, 1);
  assert.equal(priorByHash.size, 0);
});

test("planEmbeddingReuse: handles an empty prior-chunks list (first attempt at this PDF)", () => {
  const rawChunks = [{ text: "chunk", contentHash: "h1" }];

  const { toEmbed, priorByHash } = planEmbeddingReuse(rawChunks, undefined);

  assert.equal(toEmbed.length, 1);
  assert.equal(priorByHash.size, 0);
});