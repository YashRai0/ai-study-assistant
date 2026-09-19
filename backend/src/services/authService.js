import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendEmail } from "./emailTemplates.js";

// No hardcoded fallback here on purpose — validateEnv.js requires both
// JWT_SECRET and REFRESH_TOKEN_SECRET at boot, so process.env always has a
// real value by the time this module is used. A fallback like the earlier
// "dev-refresh-secret" would mean anyone could forge a refresh token for
// any deployment that forgot to set the env var, which defeats the whole
// point of validateEnv's hard-fail-at-boot check.
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export async function initiatePasswordReset(email) {
  const normalizedEmail = (email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    // Don't reveal whether the email exists — same response either way.
    return { success: true };
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  user.resetTokenHash = resetTokenHash;
  user.resetExpires = resetExpires;
  await user.save();

  const appUrl = process.env.APP_URL || "http://localhost:5173";
  const resetUrl = `${appUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(normalizedEmail)}`;
  // sendEmail is currently a stub (see emailTemplates.js) — it logs instead
  // of delivering anything. The reset token only reaches the user once a
  // real email provider is wired up there.
  await sendEmail({ to: normalizedEmail, templateName: "passwordReset", variables: { resetUrl } });

  return { success: true };
}

export async function resetPassword(email, resetToken, newPassword) {
  const normalizedEmail = (email || "").toLowerCase().trim();
  const resetTokenHash = crypto.createHash("sha256").update(resetToken || "").digest("hex");

  const user = await User.findOne({
    email: normalizedEmail,
    resetTokenHash,
    resetExpires: { $gt: new Date() },
  }).select("+resetTokenHash +resetExpires");

  if (!user) {
    throw new Error("Invalid or expired reset token");
  }

  await user.setPassword(newPassword);
  user.resetTokenHash = null;
  user.resetExpires = null;
  user.tokenRevokedAt = new Date();
  await user.save();

  return { success: true };
}

/** @param {{_id, email}} user */
export function generateTokens(user) {
  // Same payload shape requireAuth expects from the main login token
  // ({ sub, email }, see routes/auth.js's signToken) — a refresh-minted
  // access token needs to authenticate exactly like a login-minted one.
  const payload = { sub: user._id.toString(), email: user.email };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ sub: payload.sub }, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch {
    throw new Error("Invalid refresh token");
  }
}

export function logout() {
  // Stateless short-lived (15min) access tokens: there's nothing to revoke
  // server-side for a single logout, the client just discards the token.
  // Use POST /auth/revoke-all-tokens instead for "log me out everywhere,
  // immediately" (e.g. after a suspected compromise).
  return { success: true };
}

export async function revokeAllTokens(userId) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");
  user.tokenRevokedAt = new Date();
  await user.save();
  return { success: true };
}
