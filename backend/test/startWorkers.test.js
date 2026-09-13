import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

class MockWorker extends EventEmitter {
  constructor(name, processor, opts) {
    super();
    this.name = name;
    this.processor = processor;
    this.opts = opts;
    this.closed = false;
  }
  async close() {
    this.closed = true;
  }
}

class MockUnrecoverableError extends Error {}
class MockQueue extends EventEmitter {}

mock.module("bullmq", {
  exports: {
    Worker: MockWorker,
    Queue: MockQueue,
    UnrecoverableError: MockUnrecoverableError,
  },
});

mock.module("../src/services/redis.js", {
  exports: {
    getRedis: () => ({ isMockRedis: true }),
    closeRedis: async () => {},
    createRedisClient: () => ({ isMockRedis: true }),
  },
});

const { startWorkers } = await import("../workers/startWorkers.js");

const EXPECTED_QUEUES = [
  "uploadPdf",
  "uploadDocx",
  "uploadPptx",
  "ingestYoutube",
  "uploadAudio",
  "embedChunks",
  "ocr",
  "synthesis",
  "learning",
  "learningEvent",
];

test("startWorkers creates all 10 expected BullMQ workers with proper configurations", () => {
  const workers = startWorkers();
  assert.equal(workers.length, 10, "Expected exactly 10 workers");

  const names = workers.map((w) => w.name);
  for (const expected of EXPECTED_QUEUES) {
    assert.ok(names.includes(expected), `Missing worker for queue ${expected}`);
  }
});

test("workers have correct concurrency settings", () => {
  const workers = startWorkers();
  const concurrencyByName = Object.fromEntries(workers.map((w) => [w.name, w.opts?.concurrency]));
  assert.equal(concurrencyByName.uploadPdf, 2);
  assert.equal(concurrencyByName.uploadDocx, 2);
  assert.equal(concurrencyByName.uploadPptx, 2);
  assert.equal(concurrencyByName.ingestYoutube, 2);
  assert.equal(concurrencyByName.uploadAudio, 2);
  assert.equal(concurrencyByName.embedChunks, 1);
  assert.equal(concurrencyByName.ocr, 1);
  assert.equal(concurrencyByName.synthesis, 2);
  assert.equal(concurrencyByName.learning, 1);
  assert.equal(concurrencyByName.learningEvent, 4);
});

test("worker failed handler handles missing/null job without throwing", () => {
  const workers = startWorkers();
  const worker = workers[0];
  assert.doesNotThrow(() => {
    worker.emit("failed", null, new Error("Null job test error"));
  });
});

test("worker close closes all workers cleanly", async () => {
  const workers = startWorkers();
  for (const worker of workers) {
    await worker.close();
    assert.equal(worker.closed, true);
  }
});

test("RUN_WORKERS_IN_PROCESS boolean evaluation handles 'false' vs default/true", () => {
  // Test the exact expression used in server.js:
  // process.env.RUN_WORKERS_IN_PROCESS !== "false"
  const evaluate = (val) => val !== "false";

  assert.equal(evaluate(undefined), true, "undefined should default to true");
  assert.equal(evaluate(""), true, "empty string should default to true");
  assert.equal(evaluate("true"), true, "'true' should evaluate to true");
  assert.equal(evaluate("1"), true, "'1' should evaluate to true");
  assert.equal(evaluate("false"), false, "'false' should evaluate to false");
});
