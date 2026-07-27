import pino from "pino";

// A real structured logger instead of scattered console.error calls: every
// line is JSON with a level and timestamp, and callers attach a request ID
// and any relevant fields (e.g. { reqId: req.id, pdfId }) instead of just a
// string. In production this is what you'd point at a log aggregator; in
// dev, pino-pretty (optional, not wired up here to avoid an extra required
// dependency) would make it human-readable.
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});

export default logger;
