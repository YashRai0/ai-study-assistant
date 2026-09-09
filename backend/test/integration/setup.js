// Shared setup for integration tests: spins up an in-memory MongoDB
// (mongodb-memory-server) and connects the app's real Mongoose models to
// it, so these tests exercise actual database behavior (schema validation,
// unique indexes, transactions) without touching a real database.
//
// dotenv/config must be imported before anything else in this file: the
// imports below eventually pull in src/services/queues.js, which reads
// process.env.REDIS_URL at module-load time. Without dotenv loaded first,
// that read sees undefined, ioredis falls back to redis://localhost:6379,
// and — since nothing is listening there — every later attempt to close
// that connection hangs forever waiting for a connection that never
// completes, instead of failing fast.
import "dotenv/config";
//
// IMPORTANT CAVEAT: mongodb-memory-server downloads a real mongod binary on
// first run if one isn't already cached locally, which requires network
// access. These tests were written to the standard, well-established
// supertest + mongodb-memory-server pattern, but could not be executed in
// the sandbox this project was built in (no network access there at all).
// Run `npm run test:integration` locally, where normal internet access
// makes the one-time binary download a non-issue.
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connectDb } from "../../src/db/mongoose.js";
import { ALL_QUEUES } from "../../src/services/queues.js";
import { closeRedis } from "../../src/services/redis.js";

let mongod;

// Sets required env vars before app.js is dynamically imported. Uses ??=
// so a real .env file (if one happens to exist in the test environment)
// isn't clobbered — but tests should never depend on that being present.
export function setTestEnv() {
  process.env.JWT_SECRET ??= "test-jwt-secret-not-for-production-use";
  process.env.GROQ_API_KEY ??= "test-groq-key-unused-when-llm-is-mocked";
  process.env.CORS_ORIGIN ??= "http://localhost:5173";
}

export async function startTestDb() {
  mongod = await MongoMemoryServer.create();
  await connectDb(mongod.getUri());
}

export async function stopTestDb() {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  await stopTestQueues();
}

// Importing app.js (or any worker) pulls in src/services/queues.js, which
// opens a BullMQ Queue — and therefore a live ioredis connection — for
// every queue at module-load time. None of that closes itself, so without
// this the test process never goes idle: node --test eventually force-kills
// the file after its timeout, which is what "Promise resolution is still
// pending but the event loop has already resolved" actually means here.
export async function stopTestQueues() {
  await Promise.all(ALL_QUEUES.map((queue) => queue.close()));
  await closeRedis();
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}