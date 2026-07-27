import { Router } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validation/schemas.js";
import logger from "../utils/logger.js";

const router = Router();

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), email: user.email }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

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

    res.status(201).json({ token: signToken(user), email: user.email });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Register error");
    res.status(500).json({ error: "Couldn't create your account right now. Please try again." });
  }
});

router.post("/login", authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    res.json({ token: signToken(user), email: user.email });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Login error");
    res.status(500).json({ error: "Couldn't log you in right now. Please try again." });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

export default router;
