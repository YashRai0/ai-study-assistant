import crypto from "crypto";
import FeatureFlag from "../models/FeatureFlag.js";

// Check if feature is enabled for user
export async function isFeatureEnabled(featureName, userId = null, courseId = null) {
  const flag = await FeatureFlag.findOne({ name: featureName }).lean();

  if (!flag || !flag.enabled) return false;

  // targetUsers/targetCourses are ObjectId arrays from a .lean() query;
  // userId/courseId arrive as strings from req.user.id / req.params, so
  // .includes() would always miss (ObjectId !== string even for the same
  // underlying value) unless both sides are compared as strings.
  if (userId && flag.targetUsers?.some((id) => id.toString() === userId.toString())) return true;
  if (courseId && flag.targetCourses?.some((id) => id.toString() === courseId.toString())) return true;

  // Check rollout percentage
  if (flag.rolloutPercentage < 100) {
    if (!userId) return Math.random() * 100 < flag.rolloutPercentage;
    // A stable per-user bucket, not per-request randomness — the same user
    // should consistently land on the same side of the rollout, not flip
    // on every request. Using only the first character's char code (as an
    // earlier version of this did) clusters badly: ObjectIds start with a
    // timestamp, so users created around the same time would nearly all
    // hash to the same bucket. A full-string hash spreads much more evenly.
    const hash = crypto.createHash("md5").update(userId.toString()).digest();
    const bucket = hash.readUInt32BE(0) % 100;
    return bucket < flag.rolloutPercentage;
  }

  return true; // Enabled for everyone
}

// Get all enabled features for a user
export async function getEnabledFeatures(userId, courseId = null) {
  const flags = await FeatureFlag.find({ enabled: true }).lean();

  const enabledFeatures = await Promise.all(
    flags.map(async (flag) => ({
      name: flag.name,
      enabled: await isFeatureEnabled(flag.name, userId, courseId),
    }))
  );

  return enabledFeatures.filter((f) => f.enabled).map((f) => f.name);
}

// Admin: Create or update feature flag
export async function setFeatureFlag(name, options) {
  return FeatureFlag.findOneAndUpdate(
    { name },
    {
      name,
      description: options.description,
      enabled: options.enabled,
      rolloutPercentage: options.rolloutPercentage || 0,
      targetUsers: options.targetUsers || [],
      targetCourses: options.targetCourses || [],
      updatedAt: new Date(),
    },
    { upsert: true, new: true }
  );
}
