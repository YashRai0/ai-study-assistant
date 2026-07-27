import rateLimit from "express-rate-limit";

// General safety net on every request.
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." },
});

// Tighter limit on login/register — the classic brute-force / account-
// enumeration target.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait a few minutes and try again." },
});

// Protects Groq API quota from being exhausted by one user or script hammering
// chat/summary/flashcard/quiz/search endpoints. Keyed by authenticated user
// where available (these routes all run requireAuth first), falling back to
// IP for safety.
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "You're sending requests faster than I can process them. Please wait a moment." },
});

// Uploads are the most expensive operation (embedding generation, possibly
// OCR) — allow fewer of them per window than ordinary chat/search requests.
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "You've uploaded a lot of files recently. Please wait a bit before uploading more." },
});
