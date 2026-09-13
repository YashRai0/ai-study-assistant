import test from "node:test";
import assert from "node:assert/strict";
import { UnrecoverableError } from "bullmq";
import { withJobHardening } from "../src/services/jobHardening.js";

// jobRetry.js's retryStrategies is keyed by real queue names with real
// timeout values; these tests exercise withJobHardening's own logic in
// isolation using a couple of dedicated queue names, added to the actual
// strategy table it reads. This is a deliberate readthrough of the real
// config object rather than mocking it away, so a bug in how a strategy
// entry is shaped would show up here too.
import { retryStrategies } from "../src/services/jobRetry.js";
retryStrategies.__testFastTimeout = { timeout: 50 };
retryStrategies.__testNoTimeout = {}; // no timeout configured at all

test("a processor that finishes normally resolves with its own return value", async () => {
  const processor = withJobHardening("__testFastTimeout", async (job) => `handled ${job.id}`);
  const result = await processor({ id: 42 });
  assert.equal(result, "handled 42");
});

test("a processor slower than the configured timeout is failed with a timeout error", async () => {
  const processor = withJobHardening("__testFastTimeout", () => new Promise((resolve) => setTimeout(() => resolve("too late"), 200)));
  await assert.rejects(() => processor({}), /exceeded its 50ms timeout/);
});

test("a timeout error is retryable, not wrapped as UnrecoverableError (a slow run is often transient)", async () => {
  const processor = withJobHardening("__testFastTimeout", () => new Promise((resolve) => setTimeout(resolve, 200)));
  try {
    await processor({});
    assert.fail("expected processor to reject");
  } catch (err) {
    assert.equal(err instanceof UnrecoverableError, false);
  }
});

test("no timeout configured for a queue means no timeout is enforced at all", async () => {
  const processor = withJobHardening("__testNoTimeout", () => new Promise((resolve) => setTimeout(() => resolve("slow but fine"), 100)));
  const result = await processor({});
  assert.equal(result, "slow but fine");
});

test("a permanent-looking error (fails isRetryableError's patterns) is converted to UnrecoverableError", async () => {
  const processor = withJobHardening("__testFastTimeout", async () => { throw new Error("Invalid PDF: could not parse header"); });
  try {
    await processor({});
    assert.fail("expected processor to reject");
  } catch (err) {
    assert.ok(err instanceof UnrecoverableError);
    assert.equal(err.message, "Invalid PDF: could not parse header"); // original message preserved
  }
});

test("a transient-looking error is left unwrapped so BullMQ's normal attempts/backoff still applies", async () => {
  const processor = withJobHardening("__testFastTimeout", async () => { throw new Error("connect ECONNRESET"); });
  try {
    await processor({});
    assert.fail("expected processor to reject");
  } catch (err) {
    assert.equal(err instanceof UnrecoverableError, false);
    assert.equal(err.message, "connect ECONNRESET");
  }
});

test("an UnrecoverableError thrown directly by the processor passes through unchanged, not double-wrapped", async () => {
  const original = new UnrecoverableError("already fatal");
  const processor = withJobHardening("__testFastTimeout", async () => { throw original; });
  try {
    await processor({});
    assert.fail("expected processor to reject");
  } catch (err) {
    assert.equal(err, original);
  }
});

test("a slow processor that eventually rejects on its own doesn't crash the process with an unhandled rejection", async () => {
  let unhandled = false;
  const listener = () => { unhandled = true; };
  process.on("unhandledRejection", listener);
  try {
    const processor = withJobHardening("__testFastTimeout", () => new Promise((_, reject) => setTimeout(() => reject(new Error("late failure")), 200)));
    await assert.rejects(() => processor({})); // rejects with the timeout, not "late failure"
    await new Promise((r) => setTimeout(r, 250)); // let the real rejection fire in the background
    assert.equal(unhandled, false);
  } finally {
    process.off("unhandledRejection", listener);
  }
});
