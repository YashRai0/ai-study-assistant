import mongoose from "mongoose";

const attemptSchema = new mongoose.Schema({
  // Required and immutable: every route that creates an Attempt now
  // requires an eventId at the validation layer (see routes/learning.js),
  // so this tightens that into a DB-level guarantee too — a future code
  // path that forgets the route-level check still can't create an
  // Attempt without one. Non-sparse unique index is safe now that it's
  // never null (a sparse index was only needed to let multiple docs omit
  // the field).
  eventId: { type: String, required: true, immutable: true, trim: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticQuestion", default: null },
  question: { type: String, default: "" },
  answer: { type: String, default: "" },
  correct: { type: Boolean, default: null },
  score: { type: Number, min: 0, max: 1, default: null },
  confidence: { type: Number, min: 1, max: 5, default: null },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  responseTimeMs: { type: Number, min: 0, default: null },
  hintUsed: { type: Boolean, default: false },
  misconception: { type: String, default: null },
  misconceptionSeverity: { type: String, enum: ["low", "medium", "high", null], default: null },
}, { timestamps: true });

attemptSchema.index({ user: 1, eventId: 1 }, { unique: true });
attemptSchema.index({ user: 1, course: 1, conceptIds: 1, createdAt: -1 });

export default mongoose.model("Attempt", attemptSchema);

