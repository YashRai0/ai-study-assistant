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
app.use("/api/v1", v1);

// Central error handler
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