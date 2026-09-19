// Reusable AI Response Cache (Step 4 & Step 5)
// Backed by Redis when available; gracefully bypasses if Redis is down or not configured.
// Key format: ai:v1:<operation>:<model>:<reasoningEffort>:<promptVersion>:<inputHash>

import crypto from "node:crypto";
import { getRedis } from "./redis.js";
import { recordCacheHit, recordCacheMiss, recordCacheError } from "./aiMetrics.js";
import logger from "../utils/logger.js";

const DEFAULT_TTL_SECONDS = 86400; // 24 hours

export function hashInput(input) {
  const serialized = typeof input === "string" ? input : JSON.stringify(input);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

export function buildCacheKey({
  operation,
  model,
  reasoningEffort,
  promptVersion,
  inputHash,
}) {
  const op = String(operation || "generic").toLowerCase();
  const m = String(model || "gpt-oss-20b").replace(/[^a-zA-Z0-9_-]/g, "_");
  const r = String(reasoningEffort || "low");
  const pv = String(promptVersion || "v1").replace(/[^a-zA-Z0-9_:-]/g, "_");
  const hash = String(inputHash || "");
  return `ai:v1:${op}:${m}:${r}:${pv}:${hash}`;
}

export async function getCachedAiResponse(key, operation = "unknown") {
  try {
    const redis = getRedis();
    if (!redis) {
      recordCacheMiss(operation);
      return null;
    }

    const cached = await redis.get(key);
    if (cached) {
      recordCacheHit(operation);
      try {
        return JSON.parse(cached);
      } catch {
        return cached;
      }
    }
    recordCacheMiss(operation);
    return null;
  } catch (err) {
    logger.warn({ err: err.message, key }, "AI cache read failed; continuing without cache");
    recordCacheError(operation);
    return null;
  }
}

export async function setCachedAiResponse(key, value, ttlSeconds = DEFAULT_TTL_SECONDS, operation = "unknown") {
  try {
    const redis = getRedis();
    if (!redis) return false;

    const payload = typeof value === "string" ? value : JSON.stringify(value);
    await redis.set(key, payload, "EX", ttlSeconds);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, key }, "AI cache write failed; continuing without cache");
    recordCacheError(operation);
    return false;
  }
}

/**
 * Invalidates all cached AI artifacts derived from a specific document content hash.
 * Used when a PDF or document source is updated or deleted (Step 5).
 */
export async function invalidateDocumentAiArtifacts(documentHash) {
  if (!documentHash) return 0;
  try {
    const redis = getRedis();
    if (!redis) return 0;

    const pattern = `ai:v1:*:*:*:*:${documentHash}*`;
    const keys = await redis.keys(pattern);
    if (keys && keys.length > 0) {
      await redis.del(...keys);
      logger.info({ count: keys.length, documentHash }, "Invalidated AI response cache for document");
      return keys.length;
    }
    return 0;
  } catch (err) {
    logger.warn({ err: err.message, documentHash }, "Failed to invalidate document AI cache");
    return 0;
  }
}
