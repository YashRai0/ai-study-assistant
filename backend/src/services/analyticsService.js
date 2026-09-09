import mongoose from "mongoose";
import Event from "../models/Event.js";

export async function trackEvent(userId, eventType, metadata = {}) {
  try {
    await Event.create({
      user: userId,
      eventType,
      metadata: {
        ...metadata,
        platform: metadata.platform || "web",
        userAgent: metadata.userAgent || "unknown",
      },
    });
  } catch (err) {
    console.error("Failed to track event:", err);
    // Don't throw - event tracking should not break the app
  }
}

// Get user's funnel: signup -> first study -> quiz -> focus mode
export async function getUserFunnel(userId) {
  const pipeline = [
    { $match: { user: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$eventType",
        count: { $sum: 1 },
        firstEvent: { $min: "$createdAt" },
      },
    },
  ];

  const events = await Event.aggregate(pipeline);

  const funnel = {
    signups: events.find((e) => e._id === "signup")?.count || 0,
    firstStudy: events.find((e) => e._id === "concept_studied")?.count || 0,
    quizzes: events.find((e) => e._id === "quiz_completed")?.count || 0,
    focusMode: events.find((e) => e._id === "focus_mode_started")?.count || 0,
  };

  return funnel;
}

// Get feature adoption (% of users using each feature)
export async function getFeatureAdoption(since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
  const pipeline = [
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: "$eventType",
        uniqueUsers: { $addToSet: "$user" },
      },
    },
    {
      $project: {
        _id: 1,
        count: { $size: "$uniqueUsers" },
      },
    },
  ];

  const features = await Event.aggregate(pipeline);
  const totalUsers = await Event.distinct("user", { createdAt: { $gte: since } });

  return features.map((f) => ({
    feature: f._id,
    adoptionRate: ((f.count / totalUsers.length) * 100).toFixed(2) + "%",
    uniqueUsers: f.count,
  }));
}

// Get usage trends (events per day)
export async function getUsageTrends(eventType, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const pipeline = [
    { $match: { eventType, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ];

  return await Event.aggregate(pipeline);
}
