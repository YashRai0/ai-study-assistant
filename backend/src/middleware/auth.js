import jwt from "jsonwebtoken";
import User from "../models/User.js";

/**
 * Verifies the Bearer JWT and attaches { id, email } to req.user.
 *
 * Also checks the token against the user's tokenRevokedAt timestamp (set by
 * POST /auth/revoke-all-tokens) — without this, "revoke all tokens" would
 * write a field that's never actually enforced anywhere, i.e. do nothing.
 * This costs one extra lean, indexed-by-_id lookup per authenticated
 * request; acceptable at this app's scale, same tradeoff already accepted
 * for requireRole's per-request admin check.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Please log in to continue." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.iat) {
      return res.status(401).json({ error: "Your session has expired. Please log in again." });
    }

    const user = await User.findById(payload.sub).select("tokenRevokedAt").lean();
    if (!user) {
      return res.status(401).json({ error: "Your session has expired. Please log in again." });
    }
    if (user.tokenRevokedAt && payload.iat * 1000 < user.tokenRevokedAt.getTime()) {
      return res.status(401).json({ error: "Your session has expired. Please log in again." });
    }

    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}
