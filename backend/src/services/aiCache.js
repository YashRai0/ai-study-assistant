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

export function buildRerankCacheKey({
  query,
  candidates = [],
  model,
  reasoningEffort,
  promptVersion = "rerank:v1",
  retrievalVersion = "v1",
}) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  // Bounded fingerprint per candidate (index + ID + short content hash)
  const candidateFingerprints = (candidates || []).map((c, i) => {
    const id = c.id || c._id || "";
    const textSample = (c.text || "").slice(0, 100).trim();
    const snippetHash = crypto.createHash("sha256").update(textSample).digest("hex").slice(0, 12);
    return `${i}:${id}:${snippetHash}`;
  });
  const poolHash = crypto.createHash("sha256").update(candidateFingerprints.join("|")).digest("hex");
  const inputHash = crypto.createHash("sha256").update(`${normalizedQuery}::${poolHash}::${retrievalVersion}`).digest("hex");

  return buildCacheKey({
    operation: "rerank",
    model,
    reasoningEffort,
    promptVersion,
    inputHash,
  });
}

/**
 * Invalidates all cached AI artifacts derived from a specific document content hash.
 * Used when a PDF or document source is updated or deleted (Step 5).
 * Uses cursor-based SCAN instead of blocking KEYS in production.
 */
export async function invalidateDocumentAiArtifacts(documentHash) {
  if (!documentHash) return 0;
  try {
    const redis = getRedis();
    if (!redis) return 0;

    const pattern = `ai:v1:*:*:*:*:${documentHash}*`;
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys && keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== "0");

    if (deletedCount > 0) {
      logger.info({ count: deletedCount, documentHash }, "Invalidated AI response cache for document via SCAN");
    }
    return deletedCount;
  } catch (err) {
    logger.warn({ err: err.message, documentHash }, "Failed to invalidate document AI cache");
    return 0;
  }
}
