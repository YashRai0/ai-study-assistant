import "dotenv/config";

/**
 * Worker Startup: BullMQ Processors (Standalone Mode)
 *
 * Run separately from main server: `npm run worker`
 * Used when RUN_WORKERS_IN_PROCESS=false, or for horizontal worker scaling.
 * When RUN_WORKERS_IN_PROCESS=true (the default), workers run in-process inside server.js.
 */

import { connectDb } from "../src/db/mongoose.js";
import { closeRedis } from "../src/services/redis.js";
import logger from "../src/utils/logger.js";
import { startWorkers } from "./startWorkers.js";

await connectDb();

const workers = startWorkers();

/**
 * Graceful shutdown: drain queues and close connections
 */
async function shutdown() {
  logger.info("Shutting down workers...");

  // Close all workers
  for (const worker of workers) {
    await worker.close();
  }

  // Close Redis
  await closeRedis();

  logger.info("Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Prevent the process from exiting
process.stdin.resume();
