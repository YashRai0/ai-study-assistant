import mongoose from "mongoose";

const streakSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  lastActivityDate: { type: Date, default: null },
  studyDaysThisWeek: { type: Number, default: 0 },
}, { timestamps: true });

// Per-course, not per-user: streakService.js always queries/upserts by
// {user, course} together, so the unique constraint needs to match that —
// a unique index on `user` alone would throw a duplicate-key error (or
// silently clobber the wrong course's streak) the moment a user studies a
// second course.
streakSchema.index({ user: 1, course: 1 }, { unique: true });

export default mongoose.model("UserStreak", streakSchema);
