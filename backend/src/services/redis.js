import Redis from "ioredis";
import logger from "../utils/logger.js";

// Singleton Redis connection, shared across queues, caching, and rate limiting.
// Defaults to localhost:6379 for local dev; set REDIS_URL in production.
let redisInstance = null;

export function createRedisClient() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  const redis = new Redis(redisUrl, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    enableReadyCheck: false,
    enableOfflineQueue: true,
    // BullMQ requires this to be null on any connection passed to a Queue
    // or Worker — it manages retries for blocking commands itself, and
    // ioredis's own retry limit (20 by default) would otherwise fight
    // with that. Without this, `new Worker(...)` throws synchronously:
    // "BullMQ: Your redis options maxRetriesPerRequest must be null" —
    // which means the entire worker process crashes on startup, before
    // processing a single job, regardless of how correctly it's deployed.
    maxRetriesPerRequest: null,
  });

  redis.on("connect", () => {
    logger.info("Redis connected");
  });

  redis.on("error", (err) => {
    logger.error({ err }, "Redis connection error");
  });

  redis.on("close", () => {
    logger.info("Redis connection closed");
  });

  return redis;
}

export function getRedis() {
  if (!redisInstance) {
    redisInstance = createRedisClient();
  }
  return redisInstance;
}

export async function closeRedis() {
  if (redisInstance) {
    await redisInstance.quit();
    redisInstance = null;
  }
}