// Integration tests for PDF upload validation and lifecycle. The auth-
// requirement, non-PDF-rejection, and missing-file tests below don't touch
// the ML pipeline (they fail before reaching it) and are the most reliable
// tests in this file. The "successful upload" test DOES exercise real PDF
// parsing and real local embedding generation (@xenova/transformers), which
// downloads model weights on first use — an additional network dependency
// beyond the mongodb-memory-server one noted in setup.js. See that file for
// the full caveat about running these outside this project's sandbox.
import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import path from "path";
import { fileURLToPath } from "url";
import { startTestDb, stopTestDb, clearTestDb, setTestEnv } from "./setup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MINIMAL_PDF = path.join(__dirname, "fixtures", "minimal.pdf");
const NOT_A_PDF = path.join(__dirname, "fixtures", "not-a-pdf.txt");

describe("Upload integration", () => {
  let app;
  let token;

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
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "uploader@example.com", password: "password123" });
    token = res.body.token;
  });

  test("rejects an upload with no auth token", async () => {
    const res = await request(app).post("/api/v1/upload").attach("file", MINIMAL_PDF);
    assert.equal(res.status, 401);
  });

  test("rejects a request with no file attached", async () => {
    const res = await request(app).post("/api/v1/upload").set("Authorization", `Bearer ${token}`);
    assert.equal(res.status, 400);
  });

  test("rejects a file that isn't actually a PDF, even with a .pdf extension", async () => {
    const res = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", NOT_A_PDF, { filename: "fake.pdf", contentType: "application/pdf" });
    assert.equal(res.status, 400);
  });

  test("uploads a valid PDF successfully and lists it afterward", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .field("subject", "Testing")
      .attach("file", MINIMAL_PDF);

    assert.equal(uploadRes.status, 201);
    assert.ok(uploadRes.body.pdfId);
    assert.equal(uploadRes.body.subject, "Testing");

    const listRes = await request(app).get("/api/v1/upload").set("Authorization", `Bearer ${token}`);
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.pdfs.length, 1);
    assert.equal(listRes.body.pdfs[0].id, uploadRes.body.pdfId);
  });

  test("rejects re-uploading the exact same file (duplicate detection)", async () => {
    const first = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", MINIMAL_PDF);
    assert.equal(first.status, 201);

    const second = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", MINIMAL_PDF);
    assert.equal(second.status, 409);
    assert.equal(second.body.existingPdfId, first.body.pdfId);
  });

  test("deletes an uploaded PDF", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", MINIMAL_PDF);

    const deleteRes = await request(app)
      .delete(`/api/v1/upload/${uploadRes.body.pdfId}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(deleteRes.status, 200);

    const listRes = await request(app).get("/api/v1/upload").set("Authorization", `Bearer ${token}`);
    assert.equal(listRes.body.pdfs.length, 0);
  });

  test("a second user can't see or delete the first user's PDF", async () => {
    const uploadRes = await request(app)
      .post("/api/v1/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("file", MINIMAL_PDF);

    const otherUserRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "other@example.com", password: "password123" });
    const otherToken = otherUserRes.body.token;

    const listRes = await request(app).get("/api/v1/upload").set("Authorization", `Bearer ${otherToken}`);
    assert.equal(listRes.body.pdfs.length, 0);

    const deleteRes = await request(app)
      .delete(`/api/v1/upload/${uploadRes.body.pdfId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    assert.equal(deleteRes.status, 404);
  });
});
