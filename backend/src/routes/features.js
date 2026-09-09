import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getEnabledFeatures, setFeatureFlag } from "../services/featureFlagService.js";
import FeatureFlag from "../models/FeatureFlag.js";

const router = express.Router();
router.use(requireAuth);

// Get enabled features for current user
router.get("/features", async (req, res) => {
  const { courseId } = req.query;
  try {
    const features = await getEnabledFeatures(req.user.id, courseId);
    res.json({ features });
  } catch (err) {
    res.status(500).json({ error: "Failed to get features" });
  }
});

// Admin: List all feature flags
router.get("/admin/features", requireRole("admin"), async (req, res) => {
  try {
    const flags = await FeatureFlag.find().lean();
    res.json(flags);
  } catch (err) {
    res.status(500).json({ error: "Failed to get feature flags" });
  }
});

// Admin: Update feature flag
router.post("/admin/features/:name", requireRole("admin"), async (req, res) => {
  const { name } = req.params;
  const { enabled, rolloutPercentage, targetUsers, targetCourses, description } = req.body;

  try {
    const flag = await setFeatureFlag(name, {
      description,
      enabled,
      rolloutPercentage,
      targetUsers,
      targetCourses,
    });

    res.json({ success: true, flag });
  } catch (err) {
    res.status(500).json({ error: "Failed to update feature flag" });
  }
});

export default router;
