// Integration tests for single-PDF chat. The LLM (Groq) and embedding
// (@xenova/transformers) services are mocked out via node:test's
// mock.module — this is an experimental Node API (run with
// --experimental-test-module-mocks, see package.json's test:integration
// script), and mocking is the LEAST certain part of this whole test suite,
// more so even than the mongodb-memory-server/network caveats in setup.js.
// The mocking approach and API shape are written to my best understanding
// of node:test's docs, but genuinely unverified by execution — if
// mock.module's behavior differs from what's assumed here (e.g. needing to
// be called before ANY prior import of the target module anywhere in the
// process, not just before this file's own import of app.js), these tests
// may need adjustment. Test the assumption first if they don't pass as-is.
import { test, describe, before, after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startTestDb, stopTestDb, clearTestDb, setTestEnv } from "./setup.js";

const FAKE_EMBEDDING = new Array(384).fill(1); // matches the Chunk fixture below for a guaranteed strong match

describe("Chat integration", () => {
  let app;
  let token;
  let pdfId;

  before(async () => {
    await startTestDb();
    setTestEnv();

    mock.module("../../src/services/embeddings.js", {
      namedExports: {
        embedText: async () => FAKE_EMBEDDING,
        embedChunks: async (chunks) => chunks.map(() => FAKE_EMBEDDING),
      },
    });

    mock.module("../../src/services/llm.js", {
      namedExports: {
        answerFromNotes: async () => "Mocked answer from notes.",
        streamAnswerFromNotes: async (question, chunks, onToken) => {
          const text = "Mocked streamed answer about deadlocks (Page 1).";
          onToken(text);
          return text;
        },
        explainSimply: async () => "Mocked simple explanation.",
        streamExplainSimply: async (topic, chunks, onToken) => {
          const text = "Mocked simple explanation.";
          onToken(text);
          return text;
        },
        answerAcrossNotes: async () => "Mocked cross-document answer.",
        streamAnswerAcrossNotes: async (question, chunks, onToken) => {
          const text = "Mocked cross-document answer.";
          onToken(text);
          return text;
        },
        generateSummary: async () => "Mocked summary.",
        generateFlashcards: async () => JSON.stringify([{ front: "Q", back: "A" }]),
        generateQuiz: async () => JSON.stringify({ mcq: [], trueFalse: [], shortAnswer: [] }),
      },
    });

    ({ default: app } = await import("../../app.js"));
  });

  after(async () => {
    await stopTestDb();
    mock.reset();
  });

  beforeEach(async () => {
    await clearTestDb();

    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "chatuser@example.com", password: "password123" });
    token = registerRes.body.token;

    // Inserting a Pdf + Chunk directly via the models, bypassing the upload
    // route — that route exercises the real (unmocked) PDF-parsing
    // pipeline, which isn't what this file is testing. See upload.test.js
    // for upload-pipeline coverage.
    const { default: User } = await import("../../src/models/User.js");
    const { default: Pdf } = await import("../../src/models/Pdf.js");
    const { default: Chunk } = await import("../../src/models/Chunk.js");

    const user = await User.findOne({ email: "chatuser@example.com" });

    const pdf = await Pdf.create({
      owner: user._id,
      filename: "test-notes.pdf",
      subject: "Testing",
      extractionMethod: "text",
      contentHash: `test-hash-${Date.now()}-${Math.random()}`,
      gridFsFileId: user._id, // placeholder ObjectId — fine, these tests never hit the /file download route
      fullText: "Deadlock is a situation where two or more processes are waiting on each other indefinitely.",
      chunkCount: 1,
    });

    await Chunk.create({
      pdf: pdf._id,
      owner: user._id,
      subject: "Testing",
      filename: "test-notes.pdf",
      page: 1,
      text: "Deadlock is a situation where two or more processes are waiting on each other indefinitely.",
      embedding: FAKE_EMBEDDING,
    });

    pdfId = pdf._id.toString();
  });

  test("rejects chat without auth", async () => {
    const res = await request(app).post(`/api/v1/chat/${pdfId}`).send({ message: "What is a deadlock?" });
    assert.equal(res.status, 401);
  });

  test("rejects an empty message", async () => {
    const res = await request(app)
      .post(`/api/v1/chat/${pdfId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "" });
    assert.equal(res.status, 400);
  });

  test("returns 404 for a PDF that doesn't belong to the user", async () => {
    const res = await request(app)
      .post(`/api/v1/chat/000000000000000000000000`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "What is a deadlock?" });
    assert.equal(res.status, 404);
  });

  test("streams a mocked answer as Server-Sent Events", async () => {
    const res = await request(app)
      .post(`/api/v1/chat/${pdfId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "What is a deadlock?" });

    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/event-stream/);
    assert.match(res.text, /Mocked streamed answer about deadlocks/);
    assert.match(res.text, /"done":true/);
  });

  test("saves the exchange to chat history", async () => {
    await request(app)
      .post(`/api/v1/chat/${pdfId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "What is a deadlock?" });

    const historyRes = await request(app)
      .get(`/api/v1/chat/${pdfId}/history`)
      .set("Authorization", `Bearer ${token}`);

    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.body.history.length, 2);
    assert.equal(historyRes.body.history[0].role, "user");
    assert.equal(historyRes.body.history[0].content, "What is a deadlock?");
    assert.equal(historyRes.body.history[1].role, "assistant");
    assert.match(historyRes.body.history[1].content, /Mocked streamed answer/);
  });

  test("clears chat history", async () => {
    await request(app)
      .post(`/api/v1/chat/${pdfId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "What is a deadlock?" });

    const clearRes = await request(app)
      .delete(`/api/v1/chat/${pdfId}/history`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(clearRes.status, 200);

    const historyRes = await request(app)
      .get(`/api/v1/chat/${pdfId}/history`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(historyRes.body.history.length, 0);
  });
});
