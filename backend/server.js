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

// Graceful shutdown
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info(`Received ${signal}. Closing HTTP server...`);

  const forceExitTimer = setTimeout(() => {
    logger.error(
      `Shutdown did not complete within ${SHUTDOWN_TIMEOUT_MS}ms (likely an open stream connection) — forcing exit.`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  // Don't let the timer keep the process alive
  forceExitTimer.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      logger.info("HTTP server closed.");
    }

    await closeRedis();
    logger.info("Redis connection closed.");
    logger.info("Graceful shutdown complete.");

    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    clearTimeout(forceExitTimer);
    logger.error({ err }, "Error during graceful shutdown.");
    process.exit(1);
  }
};

process.on("SIGINT", () => {
  shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});