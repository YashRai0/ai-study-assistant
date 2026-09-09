import User from "../models/User.js";

/**
 * Must run after requireAuth. Checks the user's role fresh from the database
 * on every request rather than trusting a role embedded in the JWT — tokens
 * are valid for 30 days, so a promotion or revocation needs to take effect
 * immediately, not whenever the user's token happens to expire.
 */
export function requireRole(role) {
  return async function (req, res, next) {
    const user = await User.findById(req.user.id).select("role").lean();
    if (!user || user.role !== role) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}
