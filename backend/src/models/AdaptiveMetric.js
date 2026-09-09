import mongoose from "mongoose";

const adaptiveMetricSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  concept: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", default: null, index: true },
  sessionId: { type: String, default: null, index: true },
  metricType: {
    type: String,
    enum: [
      "session_started",
      "session_completed",
      "action_presented",
      "action_accepted",
      "mastery_delta",
      "retention_checkpoint",
      "misconception_recurrence",
    ],
    required: true,
    index: true,
  },
  value: { type: Number, required: true },
  baseline: { type: Number, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

adaptiveMetricSchema.index({ user: 1, course: 1, metricType: 1, createdAt: -1 });

export default mongoose.model("AdaptiveMetric", adaptiveMetricSchema);
