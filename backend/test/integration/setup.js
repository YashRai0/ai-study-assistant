// Shared setup for integration tests: spins up an in-memory MongoDB
// (mongodb-memory-server) and connects the app's real Mongoose models to
// it, so these tests exercise actual database behavior (schema validation,
// unique indexes, transactions) without touching a real database.
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
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
