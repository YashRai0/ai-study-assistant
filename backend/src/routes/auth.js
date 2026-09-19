import { Router } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema, refreshTokenSchema, updateProfileSchema } from "../validation/schemas.js";
import logger from "../utils/logger.js";
import * as authService from "../services/authService.js";
import { deleteUserAccount } from "../services/accountDeletion.js";
import { trackEvent } from "../services/analyticsService.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const user = new User({ email });
    await user.setPassword(password);
    await user.save();

    trackEvent(user._id, "signup", { platform: req.headers["x-platform"] || "web" }).catch(() => {});

    res.status(201).json({ ...authService.generateTokens(user), email: user.email });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Register error");
    res.status(500).json({ error: "Couldn't create your account right now. Please try again." });
  }
});

router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    // Always run a bcrypt compare, even when no user was found — comparing
    // against a fixed dummy hash keeps the response time the same either
    // way, so a timing difference can't be used to tell "no such account"
    // apart from "wrong password" (a user-enumeration side channel).
    const passwordOk = user
      ? await user.checkPassword(password)
      : await bcrypt.compare(password, User.dummyPasswordHash);

    if (!user || !passwordOk) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    trackEvent(user._id, "login", { platform: req.headers["x-platform"] || "web" }).catch(() => {});

    res.json({ ...authService.generateTokens(user), email: user.email });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Login error");
    res.status(500).json({ error: "Couldn't log you in right now. Please try again." });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("email name notificationsEnabled emailFrequency dataSharing").lean();
  if (!user) return res.status(404).json({ error: "User not found." });
  // Flat shape (not nested under `user`) on purpose — AuthContext.jsx
  // already depends on `data.email` here for the logged-in check on every
  // page load; nesting it would break that without a reason to.
  res.json({
    email: user.email,
    name: user.name || "",
    notificationsEnabled: user.notificationsEnabled !== false,
    emailFrequency: user.emailFrequency || "daily",
    dataSharing: user.dataSharing === true,
  });
});

router.patch("/me", requireAuth, validate(updateProfileSchema), async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, req.body, { new: true })
    .select("email name notificationsEnabled emailFrequency dataSharing");
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json({ ok: true });
});

router.delete("/me", requireAuth, authLimiter, async (req, res) => {
  try {
    const result = await deleteUserAccount(req.user.id);
    res.json(result);
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Account deletion error");
    res.status(500).json({ error: "Couldn't delete your account right now. Please try again." });
  }
});

// --- Password reset, refresh tokens, and session revocation ---
//
// Login and register now issue the same short-lived access token +
// refresh token pair as /refresh below (see authService.generateTokens).
// This used to be a "future capability" comment: login issued a single
// 30-day token because the frontend had no silent-refresh-on-401 handling
// to catch a 15-minute expiry. client.js now has that handling (see its
// response interceptor), so the short-lived pair is safe to issue from
// login/register directly instead of leaving everyone on a long-lived
// bearer token sitting in localStorage.

router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    await authService.initiatePasswordReset(req.body.email);
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Password reset initiation error");
    // Fall through to the same generic response either way — an error here
    // shouldn't reveal anything more than "no such account" would.
  }
  // Always the same response, regardless of whether the account exists or
  // the above threw — see initiatePasswordReset's own comment for why.
  res.json({ message: "If an account with that email exists, a reset link has been sent." });
});

router.post("/reset-password", authLimiter, validate(resetPasswordSchema), async (req, res) => {
  const { email, token, newPassword } = req.body;
  try {
    await authService.resetPassword(email, token, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Couldn't reset your password." });
  }
});

router.post("/refresh", authLimiter, validate(refreshTokenSchema), async (req, res) => {
  try {
    const decoded = authService.verifyRefreshToken(req.body.refreshToken);
    const user = await User.findById(decoded.sub).select("+tokenRevokedAt");
    if (!user) return res.status(401).json({ error: "Invalid refresh token." });
    if (user.tokenRevokedAt && decoded.iat && decoded.iat * 1000 < user.tokenRevokedAt.getTime()) {
      return res.status(401).json({ error: "Invalid or expired refresh token." });
    }
    const tokens = authService.generateTokens(user);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token." });
  }
});

router.post("/logout", requireAuth, (req, res) => {
  res.json(authService.logout());
});

router.post("/revoke-all-tokens", requireAuth, authLimiter, async (req, res) => {
  try {
    await authService.revokeAllTokens(req.user.id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Revoke tokens error");
    res.status(500).json({ error: "Couldn't revoke your sessions right now." });
  }
});

export default router;
