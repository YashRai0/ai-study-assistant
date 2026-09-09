import mongoose from "mongoose";

const misconceptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  concept: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true, index: true },
  description: { type: String, required: true, trim: true },
  // Normalized (lowercased, punctuation-stripped) form of `description` —
  // see misconceptionDetection.js's misconceptionKey(). Without this,
  // matching an existing record by {user, course, concept, resolved:
  // false} alone treats ANY unresolved misconception on a concept as the
  // same one: a student's first-time, unrelated error on a concept that
  // already has a different unresolved misconception logged would
  // silently inherit that other misconception's occurrence count instead
  // of starting its own — inflating risk for an error that isn't actually
  // recurring.
  misconceptionKey: { type: String, default: null, index: true },
  severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  // Precise 0–1 score from combineMisconceptionSignals() — severity above
  // is the coarse bucket derived from this for display/filtering; this is
  // the actual value other services (exam readiness, next-action ranking)
  // should read when they want more resolution than three buckets.
  risk: { type: Number, min: 0, max: 1, default: 0.5 },
  occurrences: { type: Number, default: 1 },
  resolved: { type: Boolean, default: false },
  evidence: [{ attemptId: mongoose.Schema.Types.ObjectId, text: String }],
  lastDetectedAt: { type: Date, default: Date.now },
}, { timestamps: true });

misconceptionSchema.index({ user: 1, course: 1, concept: 1, resolved: 1 });
misconceptionSchema.index({ user: 1, course: 1, concept: 1, misconceptionKey: 1 });

export default mongoose.model("Misconception", misconceptionSchema);
