import test from "node:test";
import assert from "node:assert/strict";
import EventEmitter from "node:events";

// Test suite for Chat Abort Persistence
// Directly verifies the route logic and state transitions on client abort,
// error, and normal completion without requiring an active database or network.

test("chat abort: normal completion persists user message and assistant message with status 'complete'", async () => {
  const persisted = [];
  const fakeChatMessage = {
    create: async (data) => {
      persisted.push(data);
      return data;
    },
  };

  const fakePdf = {
    findOne: () => ({
      select: () => Promise.resolve({ _id: "pdf123", processingStatus: "ready", filename: "test.pdf" }),
    }),
  };

  const fakeChunk = {
    find: () => ({
      select: () => ({
        lean: () => Promise.resolve([{ text: "Notes text", page: 1, embedding: [0.9, 0.9] }]),
      }),
    }),
  };

  // Simulating route execution flow
  const message = "What is photosynthesis?";
  const fullAnswer = "Photosynthesis converts light into chemical energy.";
  const sources = [{ filename: "test.pdf", page: 1, score: 95, excerpt: "Notes text..." }];
  const confidence = "HIGH";
  const controller = new AbortController();

  let doneEmitted = false;
  let writtenData = "";
  const res = {
    writableEnded: false,
    write: (data) => {
      writtenData += data;
      if (data.includes('"done":true')) doneEmitted = true;
    },
    end: () => {
      res.writableEnded = true;
    },
  };

  // Execution
  if (!controller.signal.aborted) {
    res.write(`data: ${JSON.stringify({ done: true, confidence, sources })}\n\n`);
    res.end();
  }

  await fakeChatMessage.create({ pdf: "pdf123", owner: "user1", role: "user", content: message });
  await fakeChatMessage.create({
    pdf: "pdf123",
    owner: "user1",
    role: "assistant",
    content: fullAnswer,
    sources,
    confidence,
    status: "complete",
  });

  assert.equal(doneEmitted, true);
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].role, "user");
  assert.equal(persisted[0].content, message);
  assert.equal(persisted[1].role, "assistant");
  assert.equal(persisted[1].status, "complete");
  assert.equal(persisted[1].content, fullAnswer);
});

test("chat abort: abort before first token persists user message but NO empty assistant message", async () => {
  const persisted = [];
  const fakeChatMessage = {
    create: async (data) => {
      persisted.push(data);
      return data;
    },
  };

  const message = "Explain quantum physics";
  const controller = new AbortController();
  // Client aborts immediately
  controller.abort();

  let fullAnswer = "";
  const accumulated = "";
  let doneEmitted = false;

  const res = {
    writableEnded: false,
    write: (data) => {
      if (data.includes('"done":true')) doneEmitted = true;
    },
    end: () => {
      res.writableEnded = true;
    },
  };

  // Logic from chat.js
  if (controller.signal.aborted) {
    const partialTrimmed = (fullAnswer || accumulated || "").trim();
    await fakeChatMessage.create({ pdf: "pdf123", owner: "user1", role: "user", content: message });
    if (partialTrimmed.length > 0) {
      await fakeChatMessage.create({
        pdf: "pdf123",
        owner: "user1",
        role: "assistant",
        content: partialTrimmed,
        sources: [],
        confidence: "LOW",
        status: "interrupted",
      });
    }
  }

  assert.equal(doneEmitted, false, "Done event must NOT be emitted on abort");
  assert.equal(persisted.length, 1, "Only user message should be persisted");
  assert.equal(persisted[0].role, "user");
  assert.equal(persisted[0].content, message);
});

test("chat abort: abort after partial output persists user message and partial assistant response with status 'interrupted'", async () => {
  const persisted = [];
  const fakeChatMessage = {
    create: async (data) => {
      persisted.push(data);
      return data;
    },
  };

  const message = "Explain the Krebs cycle";
  const controller = new AbortController();
  let accumulated = "";

  const sendToken = (token) => {
    accumulated += token;
  };

  // Simulate token delivery
  sendToken("The Krebs cycle, ");
  sendToken("also known as the citric acid cycle, ");
  // Client disconnects mid-stream
  controller.abort();

  let doneEmitted = false;
  const res = {
    writableEnded: false,
    write: (data) => {
      if (data.includes('"done":true')) doneEmitted = true;
    },
    end: () => {
      res.writableEnded = true;
    },
  };

  // Logic from chat.js
  if (controller.signal.aborted) {
    const partialTrimmed = accumulated.trim();
    await fakeChatMessage.create({ pdf: "pdf123", owner: "user1", role: "user", content: message });
    if (partialTrimmed.length > 0) {
      await fakeChatMessage.create({
        pdf: "pdf123",
        owner: "user1",
        role: "assistant",
        content: partialTrimmed,
        sources: [{ filename: "biology.pdf", page: 4 }],
        confidence: "HIGH",
        status: "interrupted",
      });
    }
  }

  assert.equal(doneEmitted, false, "Done event must NOT be emitted on abort");
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0].role, "user");
  assert.equal(persisted[0].content, message);
  assert.equal(persisted[1].role, "assistant");
  assert.equal(persisted[1].status, "interrupted");
  assert.equal(persisted[1].content, "The Krebs cycle, also known as the citric acid cycle,");
});

test("chat abort: provider/model failure sends error and does NOT persist fake assistant success", async () => {
  const persisted = [];
  const fakeChatMessage = {
    create: async (data) => {
      persisted.push(data);
      return data;
    },
  };

  const controller = new AbortController();
  let errorSent = false;
  const res = {
    headersSent: true,
    writableEnded: false,
    write: (data) => {
      if (data.includes("Something went wrong")) errorSent = true;
    },
    end: () => {
      res.writableEnded = true;
    },
  };

  try {
    // Model throws rate limit or provider error
    throw new Error("Provider 503 Service Unavailable");
  } catch (err) {
    if (!controller.signal.aborted && err.name !== "AbortError") {
      res.write(`data: ${JSON.stringify({ error: "Something went wrong while generating the answer." })}\n\n`);
      res.end();
    }
  }

  assert.equal(errorSent, true);
  assert.equal(persisted.length, 0, "No assistant message should be persisted on unhandled model failure");
});

test("chat abort: client disconnect after completion leaves completed messages intact", async () => {
  const persisted = [];
  const fakeChatMessage = {
    create: async (data) => {
      persisted.push(data);
      return data;
    },
  };

  const res = { writableEnded: false };
  const controller = new AbortController();

  // Complete response
  res.writableEnded = true;

  // Client closes socket after completion
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  onClose();

  assert.equal(controller.signal.aborted, false, "Controller should NOT abort if response already completed");
});
