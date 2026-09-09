import mongoose from "mongoose";

const studentConceptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  concept: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true, index: true },
  mastery: { type: Number, min: 0, max: 1, default: 0 },
  confidence: { type: Number, min: 0, max: 1, default: 0.5 },
  // Running average of (correctness - confidence) across attempts, in
  // [-1, 1]. Strongly negative = overconfident (answers wrong while sure of
  // themselves); strongly positive = underconfident (answers right while
  // unsure). 0 = well calibrated. See services/calibration.js.
  calibration: { type: Number, min: -1, max: 1, default: 0 },
  retention: { type: Number, min: 0, max: 1, default: 1 },
  // Canonical SM-2 spaced-repetition state — the same algorithm and field
  // shape as Flashcard's easeFactor/interval/repetitions (see
  // services/spacedRepetition.js), applied here to concept mastery
  // reviews instead of flashcards. Previously nextReviewAt was scheduled
  // from a mastery-bucket heuristic (getReviewDate: fixed hour buckets by
  // current mastery, difficulty, and misconception risk) that re-derived
  // the interval from scratch every time rather than growing it across
  // consecutive successful reviews — so a concept gotten right five times
  // in a row didn't get spaced out further than one gotten right once.
  // `retention` above is unrelated and unaffected: it's still the
  // Ebbinghaus-curve read-time estimate of how much of current mastery is
  // still recallable (see masteryWithEbbinghaus.js), not a scheduling
  // input.
  srsEaseFactor: { type: Number, min: 1.3, default: 2.5 },
  srsInterval: { type: Number, min: 0, default: 0 }, // days
  srsRepetitions: { type: Number, min: 0, default: 0 },
  attempts: { type: Number, default: 0 },
  correct: { type: Number, default: 0 },
  incorrect: { type: Number, default: 0 },
  averageResponseTime: { type: Number, default: null },
  forgettingRisk: { type: Number, min: 0, max: 1, default: 0 },
  misconceptionRisk: { type: Number, min: 0, max: 1, default: 0 },
  lastReviewedAt: { type: Date, default: null },
  nextReviewAt: { type: Date, default: null },
}, { timestamps: true });

studentConceptSchema.index({ user: 1, course: 1, concept: 1 }, { unique: true });
// Backs the cross-course review-queue endpoint (GET /learning/review-queue),
// which finds everything due for a user across every course they own.
studentConceptSchema.index({ user: 1, nextReviewAt: 1 });

export default mongoose.model("StudentConcept", studentConceptSchema);
