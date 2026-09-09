import mongoose from "mongoose";

const featureFlagSchema = new mongoose.Schema(
  {
    name: { type: String, unique: true, required: true, index: true },
    description: String,
    enabled: { type: Boolean, default: false },
    rolloutPercentage: { type: Number, min: 0, max: 100, default: 0 },
    targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Beta users
    targetCourses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }], // Courses to enable for
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "feature_flags" }
);

export default mongoose.model("FeatureFlag", featureFlagSchema);
