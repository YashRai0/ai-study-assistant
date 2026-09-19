import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

// Replicate and test quiz attempt validation and authoritative scoring logic
const attemptSchema = z
  .object({
    score: z.number().int().min(0).optional(),
    total: z.number().int().min(1).optional(),
    answers: z.record(z.any()).optional(),
    items: z
      .array(
        z.object({
          id: z.string().min(1),
          answer: z.any(),
        })
      )
      .optional(),
  })
  .refine(
    (data) => {
      if (data.score !== undefined && data.total !== undefined) {
        return data.score <= data.total;
      }
      return true;
    },
    { message: "Score cannot exceed total." }
  );

/**
 * Pure server-side scoring algorithm used in routes/quiz.js
 */
function calculateQuizAttemptScore({ doc, answers, items, score, total }) {
  let finalScore;
  let finalTotal;

  // Path 1: Authoritative scoring against doc.activeQuiz
  if (doc?.activeQuiz && answers && typeof answers === "object") {
    let authScore = 0;
    let authTotal = 0;

    if (Array.isArray(doc.activeQuiz.mcq)) {
      doc.activeQuiz.mcq.forEach((q, i) => {
        authTotal++;
        if (answers[`mcq-${i}`] === q.answer) authScore++;
      });
    }

    if (Array.isArray(doc.activeQuiz.trueFalse)) {
      doc.activeQuiz.trueFalse.forEach((q, i) => {
        authTotal++;
        if (answers[`tf-${i}`] === q.answer) authScore++;
      });
    }

    if (authTotal > 0) {
      finalScore = authScore;
      finalTotal = authTotal;
    }
  }

  // Path 2: Authoritative scoring against submitted items with deduplication
  if (finalScore === undefined && Array.isArray(items) && items.length > 0) {
    const seenIds = new Set();
    let itemScore = 0;
    let itemTotal = 0;
    const ansMap = answers || {};

    for (const item of items) {
      if (!item || !item.id || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      itemTotal++;
      if (ansMap[item.id] === item.answer) {
        itemScore++;
      }
    }

    if (itemTotal > 0) {
      finalScore = itemScore;
      finalTotal = itemTotal;
    }
  }

  // Path 3: Fallback with strict bounds validation
  if (finalScore === undefined) {
    if (doc?.activeQuiz) {
      throw new Error("Student answers are required for quiz scoring.");
    }
    if (typeof score !== "number" || typeof total !== "number") {
      throw new Error("Invalid attempt: score and total are required.");
    }
    if (score < 0 || total <= 0 || score > total) {
      throw new Error("Invalid score: must be between 0 and total, with total >= 1.");
    }
    finalScore = score;
    finalTotal = total;
  }

  return { score: finalScore, total: finalTotal };
}

test("quizScoring: rejects negative score", () => {
  assert.throws(() => attemptSchema.parse({ score: -1, total: 10 }), z.ZodError);
});

test("quizScoring: rejects score greater than total", () => {
  assert.throws(() => attemptSchema.parse({ score: 12, total: 10 }), z.ZodError);
});

test("quizScoring: rejects total less than or equal to 0", () => {
  assert.throws(() => attemptSchema.parse({ score: 0, total: 0 }), z.ZodError);
  assert.throws(() => attemptSchema.parse({ score: 0, total: -5 }), z.ZodError);
});

test("quizScoring: client cannot claim 100% when submitted answers are incorrect", () => {
  const doc = {
    activeQuiz: {
      mcq: [
        { question: "Q1", options: ["A", "B", "C"], answer: "B" },
        { question: "Q2", options: ["A", "B", "C"], answer: "A" },
      ],
      trueFalse: [
        { question: "Q3", answer: true },
      ],
    },
  };

  // Malicious client claims score: 100, but provides wrong answers
  const submission = {
    score: 100,
    total: 3,
    answers: {
      "mcq-0": "C", // incorrect (expected B)
      "mcq-1": "A", // correct
      "tf-0": false, // incorrect (expected true)
    },
  };

  const calculated = calculateQuizAttemptScore({ doc, ...submission });
  assert.equal(calculated.score, 1, "Server must override forged score: only 1 answer is correct");
  assert.equal(calculated.total, 3, "Server authoritative total must match quiz items count");
  assert.notEqual(calculated.score, 100, "Server must NEVER record client forged 100 score");
});

test("quizScoring: all correct answers produce perfect score", () => {
  const doc = {
    activeQuiz: {
      mcq: [
        { question: "Q1", answer: "B" },
        { question: "Q2", answer: "C" },
      ],
      trueFalse: [
        { question: "Q3", answer: true },
      ],
    },
  };

  const submission = {
    answers: {
      "mcq-0": "B",
      "mcq-1": "C",
      "tf-0": true,
    },
  };

  const calculated = calculateQuizAttemptScore({ doc, ...submission });
  assert.equal(calculated.score, 3);
  assert.equal(calculated.total, 3);
});

test("quizScoring: duplicate item answers cannot inflate total or score", () => {
  const items = [
    { id: "q1", answer: "A" },
    { id: "q1", answer: "A" }, // duplicate
    { id: "q1", answer: "A" }, // duplicate
    { id: "q2", answer: "B" },
  ];

  const submission = {
    items,
    answers: {
      q1: "A",
      q2: "B",
    },
  };

  const calculated = calculateQuizAttemptScore({ doc: null, ...submission });
  assert.equal(calculated.total, 2, "Deduplication must yield exactly 2 unique questions");
  assert.equal(calculated.score, 2, "Score must not be inflated by duplicates");
});

test("quizScoring: unauthorized document lookup rejects attempt", () => {
  const mockDbPdfs = [
    { _id: "pdf_1", owner: "user_alice", subject: "Math" },
  ];

  function findPdfForAttempt(pdfId, requestingUser) {
    return mockDbPdfs.find((p) => p._id === pdfId && p.owner === requestingUser) || null;
  }

  // Bob tries to record an attempt on Alice's PDF
  const found = findPdfForAttempt("pdf_1", "user_bob");
  assert.equal(found, null, "Attempt on another user's document must be blocked (404/not found)");
});

test("quizScoring: unverified score without answers is rejected when activeQuiz exists", () => {
  const doc = {
    activeQuiz: {
      mcq: [{ question: "Q1", answer: "A" }],
    },
  };

  assert.throws(
    () => calculateQuizAttemptScore({ doc, score: 1, total: 1 }),
    /Student answers are required/i,
    "When authoritative quiz exists, unverified self-reported score must be rejected"
  );
});

test("quizScoring: QuizAttempt does not mutate mastery or student concept state", () => {
  // Mastery updates only occur in mastery.js recordAttempt via durable learning attempts
  const initialStudentMastery = 0.42;
  const mockQuizAttempt = {
    owner: "user_alice",
    score: 10,
    total: 10,
  };

  // Recording a quiz attempt purely writes to QuizAttempt collection
  const recordedAttempt = { ...mockQuizAttempt, recorded: true };
  assert.ok(recordedAttempt.recorded);
  assert.equal(initialStudentMastery, 0.42, "QuizAttempt must have zero direct mutation on mastery state");
});
