import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventType: {
      type: String,
      enum: [
        "login",
        "logout",
        "signup",
        "course_created",
        "pdf_uploaded",
        "concept_studied",
        "quiz_completed",
        "focus_mode_started",
        "focus_mode_ended",
        "settings_changed",
      ],
      required: true,
      index: true,
    },
    metadata: {
      courseId: mongoose.Schema.Types.ObjectId,
      conceptId: mongoose.Schema.Types.ObjectId,
      pdfId: mongoose.Schema.Types.ObjectId,
      duration: Number, // in seconds
      score: Number,
      total: Number,
      completed: Boolean,
      platform: String, // 'web', 'mobile'
      userAgent: String,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "events" }
);

// Index for analytics queries
eventSchema.index({ user: 1, eventType: 1, createdAt: 1 });
eventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days TTL

export default mongoose.model("Event", eventSchema);
