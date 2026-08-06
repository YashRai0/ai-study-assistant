// Order matters here: dotenv must populate process.env before validateEnv
// checks it, and validateEnv must run before app.js — app.js transitively
// imports services/llm.js, which constructs a Groq client using
// process.env.GROQ_API_KEY at module top-level. Import declarations are
// hoisted in Node's ESM loader, but hoisted imports still evaluate in the
// order they're written relative to each other, so this ordering is what
// makes the check actually run first.
import "dotenv/config";
import "./src/utils/validateEnv.js";

import app from "./app.js";
import { connectDb } from "./src/db/mongoose.js";
import logger from "./src/utils/logger.js";
import { getRedis, closeRedis } from "./src/services/redis.js";
import { attachJobListeners } from "./src/services/jobListeners.js";

const PORT = process.env.PORT || 5000;
let server;

connectDb()
  .then(() => {
    // Initialize Redis connection and job event listeners
    getRedis(); // Lazy-init singleton
    attachJobListeners(); // Listen for queue events (job completion, failure)

    server = app.listen(PORT, () => {
      logger.info(`AI Study Assistant backend running on http://localhost:${PORT}`);
      logger.info("BullMQ queues initialized (awaiting worker processes)");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to connect to MongoDB");
    process.exit(1);
  });

// Handle graceful shutdown on signals sent by hosting platforms (e.g., Railway/Docker).
// server.close() alone is not enough here: it stops accepting new connections
// but its callback only fires once every existing connection ends — and this
// app has long-lived SSE streams (chat.js, multiChat.js, group chat) that can
// stay open well past a normal shutdown window. Verified directly: with one
// open stream and no fallback, the process hung 8+ seconds with no sign of
// closing on its own, until the platform's own SIGKILL grace period would
// eventually force it anyway — silently, with no log explaining why.
// SHUTDOWN_TIMEOUT_MS below guarantees an exit either way, and logs which
// path was taken.
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

const shutdown = (signal) => {
  // Some platforms send the signal more than once during a redeploy; without
  // this guard, a second call would invoke server.close() on an
  // already-closing server, which throws (ERR_SERVER_NOT_RUNNING).
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Closing HTTP server...`);

  const forceExitTimer = setTimeout(() => {
    logger.error(
      `Shutdown did not complete within ${SHUTDOWN_TIMEOUT_MS}ms (likely an open stream connection) — forcing exit.`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  // Don't let this pending timer itself keep the process alive if the
  // graceful path finishes first.
  forceExitTimer.unref();

  if (server) {
    server.close(async () => {
      clearTimeout(forceExitTimer);
      await closeRedis();
      logger.info("HTTP server closed. Exiting process.");
      process.exit(0);
    });
  } else {
    clearTimeout(forceExitTimer);
    await closeRedis();
    process.exit(0);
  }
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));