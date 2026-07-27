import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { generalLimiter } from "./src/middleware/rateLimit.js";
import { requestId } from "./src/middleware/requestId.js";
import logger from "./src/utils/logger.js";
import authRouter from "./src/routes/auth.js";
import uploadRouter from "./src/routes/upload.js";
import chatRouter from "./src/routes/chat.js";
import summaryRouter from "./src/routes/summary.js";
import flashcardsRouter from "./src/routes/flashcards.js";
import quizRouter from "./src/routes/quiz.js";
import searchRouter from "./src/routes/search.js";
import multiChatRouter from "./src/routes/multiChat.js";
import voiceRouter from "./src/routes/voice.js";
import analyticsRouter from "./src/routes/analytics.js";
import studyPlanRouter from "./src/routes/studyPlan.js";
import groupsRouter from "./src/routes/groups.js";

// The Express app itself, separated from server.js's "connect to the real
// DB and start listening" logic — this file exports just the app so
// integration tests can import it directly, wire it up to a test database
// (mongodb-memory-server), and drive requests through it with supertest,
// without needing an actual running server process or the production
// MongoDB connection.
const app = express();

// Security headers (X-Frame-Options, X-Content-Type-Options, etc.).
// CSP (Content-Security-Policy) is explicitly disabled here rather than left
// on helmet's HTML-oriented defaults: this backend only ever returns JSON,
// never renders HTML, so a CSP header on these responses doesn't restrict
// anything meaningful — CSP governs what a browser is allowed to load/run
// when rendering a page, and this server never serves one. If this backend
// ever starts serving HTML directly (e.g. server-rendering something,
// rather than staying an API consumed by the separately-hosted frontend),
// revisit this and configure real directives instead of disabling it.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "http://localhost:5173",
  })
);
app.use(express.json());
app.use(requestId);
app.use(generalLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// API versioned under /v1 so future breaking changes don't have to break
// existing clients — new versions can be mounted alongside this one instead
// of replacing it.
const v1 = express.Router();
v1.use("/auth", authRouter);
v1.use("/upload", uploadRouter);
v1.use("/chat", chatRouter);
v1.use("/summary", summaryRouter);
v1.use("/flashcards", flashcardsRouter);
v1.use("/quiz", quizRouter);
v1.use("/search", searchRouter);
v1.use("/multi-chat", multiChatRouter);
v1.use("/voice", voiceRouter);
v1.use("/analytics", analyticsRouter);
v1.use("/study-plan", studyPlanRouter);
v1.use("/groups", groupsRouter);
app.use("/api/v1", v1);

// Central error handler (e.g. multer file-type/size rejections)
app.use((err, req, res, next) => {
  if (err.message === "INVALID_FILE_TYPE") {
    return res.status(400).json({ error: "Only PDF files are supported." });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File is too large. Maximum size is 20MB." });
  }
  logger.error({ reqId: req.id, err }, "Unhandled error");
  res.status(500).json({ error: "Unexpected server error." });
});

export default app;
