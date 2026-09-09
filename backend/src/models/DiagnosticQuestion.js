import mongoose from "mongoose";

const diagnosticQuestionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true }],
  question: { type: String, required: true, trim: true },
  type: { type: String, enum: ["mcq", "short_answer"], required: true },
  options: [{ type: String, trim: true }],
  answer: { type: String, required: true },
  explanation: { type: String, default: "" },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  // Running tally of real attempts on this question, used to calibrate the
  // author-assigned `difficulty` above against how hard it actually turns
  // out to be — see services/difficultyCalibration.js. Not a replacement
  // for `difficulty`; low-sample-size questions should still mostly trust
  // the author's estimate (see calibrateDifficulty's shrinkage weighting).
  attemptStats: {
    total: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    averageResponseTime: { type: Number, min: 0, default: 0 },
    // Not yet populated by anything (no variance/M2 accumulation is
    // implemented) — reserved for a future response-time-variance signal,
    // schema-compatible with that when it's built rather than needing a
    // migration then.
    responseTimeM2: { type: Number, min: 0, default: 0 },
    lastAttemptAt: { type: Date, default: null },
  },
  // Free-text tags describing which misconception(s) this question is
  // designed to surface, matched case-insensitively as a substring against
  // an LLM-detected misconception's description in
  // services/questionIntelligence.js's scoreQuestion — lets misconception-
  // targeted question selection prefer a question actually built for the
  // misconception in play over a generic one. Not yet populated by the
  // diagnostic-question generation pipeline; defaults to inert (empty)
  // until that's wired up.
  misconceptionTags: [{ type: String, trim: true }],
  targetsMisconception: { type: Boolean, default: false },
  // Bloom-style level, low to high. See services/cognitiveLevel.js — used to
  // progress a student from recognition/recall toward application/transfer
  // as their mastery of a concept grows, rather than only varying numeric
  // difficulty.
  cognitiveLevel: {
    type: String,
    enum: ["recognition", "recall", "application", "analysis", "transfer"],
    default: "recall",
  },
  sourcePdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", default: null },
  // Which source chunks this question is actually grounded in — read by
  // scoreQuestion (small "evidence" bonus) and useful to eventually show
  // students provenance ("based on page 12 of your PDF"). Not yet
  // populated by the diagnostic-question generation pipeline; the schema
  // exists so evidence-ranking work can populate it without a migration.
  evidenceRefs: [{ sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "Source" }, page: Number, chunkId: { type: mongoose.Schema.Types.ObjectId, ref: "Chunk" } }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

diagnosticQuestionSchema.index({ course: 1, active: 1 });
diagnosticQuestionSchema.index({ course: 1, question: 1 }, { unique: true });
// Every question-selection call (findQuestionForConcept, used by study
// sessions, adaptive practice, and the exam simulator) filters by exactly
// this shape: course + a specific concept in the conceptIds array + active.
// Without this index, that query can only use the {course,active} index as
// a prefix and then scan every matching document's conceptIds array in
// memory — fine at a handful of questions per course, increasingly wasteful
// as question banks grow. Mongo automatically builds this as a multikey
// index since conceptIds is an array field.
diagnosticQuestionSchema.index({ course: 1, conceptIds: 1, active: 1 });

export default mongoose.model("DiagnosticQuestion", diagnosticQuestionSchema);
