// Integration tests for the auth flow (register/login/me), run against a
// real (in-memory) MongoDB via mongodb-memory-server and the real Express
// app. See setup.js for the important caveat about network access needed
// to run these.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestDb, stopTestDb, clearTestDb, setTestEnv } from "./setup.js";

describe("Auth integration", () => {
  let app;

  before(async () => {
    await startTestDb();
    setTestEnv();
    ({ default: app } = await import("../../app.js"));
  });

  after(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  test("registers a new user and returns a token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "student@example.com", password: "password123" });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.email, "student@example.com");
  });

  test("rejects registration with a too-short password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "student2@example.com", password: "short" });
    assert.equal(res.status, 400);
  });

  test("rejects registration with an invalid email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "not-an-email", password: "password123" });
    assert.equal(res.status, 400);
  });

  test("rejects a duplicate email registration", async () => {
    await request(app).post("/api/v1/auth/register").send({ email: "dup@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "dup@example.com", password: "password123" });
    assert.equal(res.status, 409);
  });

  test("logs in with correct credentials", async () => {
    await request(app).post("/api/v1/auth/register").send({ email: "login@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "login@example.com", password: "password123" });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  test("rejects login with the wrong password", async () => {
    await request(app).post("/api/v1/auth/register").send({ email: "wrongpw@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "wrongpw@example.com", password: "not-the-password" });
    assert.equal(res.status, 401);
  });

  test("rejects login for a nonexistent account", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });
    assert.equal(res.status, 401);
  });

  test("GET /auth/me requires a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    assert.equal(res.status, 401);
  });

  test("GET /auth/me returns the logged-in user's email with a valid token", async () => {
    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "me@example.com", password: "password123" });
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${registerRes.body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.email, "me@example.com");
  });

  test("rejects a malformed/invalid token", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer not-a-real-token");
    assert.equal(res.status, 401);
  });
});
