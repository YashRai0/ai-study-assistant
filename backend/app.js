import "dotenv/config";
// Must be imported before any router is created/used: this patches Express's
// router methods so a rejected promise inside an async route handler is
// automatically forwarded to the error-handling middleware below, instead of
// becoming an unhandled rejection that can crash the whole process. This is
// the fix for the "Cast to ObjectId failed... Crashed" incident — routes
// like GET /:pdfId/history had no try/catch, and Express 4 doesn't catch
// async errors on its own the way Express 5 does.
import "express-async-errors";
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
import adminRouter from "./src/routes/admin.js";

const app = express();
app.set("trust proxy", 1);

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Allowed origins for CORS (supports comma-separated origins from ENV or localhost fallback)
const rawOrigins = process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((url) => url.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked request from origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(requestId);
app.use(generalLimiter);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// API versioned under /v1
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
v1.use("/admin", adminRouter);
app.use("/api/v1", v1);

// Central error handler
app.use((err, req, res, next) => {
  if (err.message === "INVALID_FILE_TYPE") {
    return res.status(400).json({ error: "Only PDF files are supported." });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File is too large. Maximum size is 20MB." });
  }
  // Mongoose throws CastError when a route param that's supposed to be an
  // ObjectId isn't one (e.g. a stale/bad frontend request sending the
  // literal string "undefined" as an ID) — this is a bad-input problem the
  // client can act on, not a server fault, so 400 rather than 500.
  if (err.name === "CastError") {
    return res.status(400).json({ error: "That ID doesn't look valid. Please try again." });
  }
  logger.error({ reqId: req.id, err }, "Unhandled error");
  res.status(500).json({ error: "Unexpected server error." });
});

export default app;