// This intentionally inspects source text rather than importing
// services/queues.js directly: that module constructs real ioredis
// connections at import time (Queue instances connect eagerly by
// default), which would make this test depend on a live Redis instance
// and leave open handles behind. The regression this guards against —
// someone adds a new Queue and forgets to add it to ALL_QUEUES, so the
// admin dashboard silently stops seeing it — is fully catchable by
// checking the two source files agree, with no runtime dependency.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const queuesSource = readFileSync(path.join(__dirname, "../src/services/queues.js"), "utf8");
const adminSource = readFileSync(path.join(__dirname, "../src/routes/admin.js"), "utf8");

test("every `export const xQueue = new Queue(...)` is listed in ALL_QUEUES", () => {
  const definedQueueNames = [...queuesSource.matchAll(/export const (\w+) = new Queue\(/g)].map((m) => m[1]);
  assert.ok(definedQueueNames.length >= 10, `expected at least 10 queues to be defined, found ${definedQueueNames.length}`);

  const allQueuesMatch = queuesSource.match(/export const ALL_QUEUES = \[([^\]]+)\];/);
  assert.ok(allQueuesMatch, "queues.js no longer exports ALL_QUEUES");
  const listedNames = allQueuesMatch[1].split(",").map((s) => s.trim()).filter(Boolean);

  for (const name of definedQueueNames) {
    assert.ok(
      listedNames.includes(name),
      `${name} is defined but missing from ALL_QUEUES — admin monitoring (queue-status, job lookup, retry, drain) will silently skip it`
    );
  }
});

test("admin.js imports ALL_QUEUES rather than a hardcoded queue subset", () => {
  assert.match(adminSource, /import\s*\{\s*ALL_QUEUES\s*\}\s*from\s*"\.\.\/services\/queues\.js"/);
});

test("admin.js has not reintroduced a hardcoded 4-queue list", () => {
  assert.doesNotMatch(
    adminSource,
    /\[\s*uploadPdfQueue,\s*embedChunksQueue,\s*ocrQueue,\s*synthesisQueue\s*\]/,
    "found the old hardcoded queue list — docx/pptx/youtube/audio/learning/learningEvent queues would go unmonitored again"
  );
});
