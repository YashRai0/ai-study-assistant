import mongoose from "mongoose";

// Denormalized per-answer log, kept on the session itself rather than
// requiring a join back through Attempt for every "what did they answer
// last time" question a resumed or reviewed diagnostic needs to ask.
// attemptId still links back to the canonical Attempt document (created
// by recordDurableAttempt) for anything that needs the full record.
const diagnosticAnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticQuestion", required: true },
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: "Attempt", default: null },
  correct: { type: Boolean, required: true },
  score: { type: Number, min: 0, max: 1, default: null },
  confidence: { type: Number, min: 1, max: 5, default: null },
  conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

// Previously the diagnostic flow was stateless: the client held the
// running `answered[]` history and resent it on every /diagnostic/next
// call (see the old comment on that route). That meant no record of when
// a diagnostic happened, no way to resume one interrupted by a closed tab
// or lost connection, and the question-selection engine trusted whatever
// history the client chose to send. This persists that history
// server-side instead — see routes/learning.js's /diagnostic/start,
// /diagnostic/next, and the sessionId handling in recordDurableAttempt
// (adaptiveRuntime.js).
const diagnosticSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  status: { type: String, enum: ["active", "completed", "abandoned"], default: "active", index: true },
  currentQuestionId: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticQuestion", default: null },
  answers: { type: [diagnosticAnswerSchema], default: [] },
  maxQuestions: { type: Number, min: 1, max: 50, default: 12 },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

diagnosticSessionSchema.index({ user: 1, course: 1, status: 1, updatedAt: -1 });

// At most one in-progress diagnostic per (user, course) — a partial index
// so completed/abandoned sessions from the same course don't collide with
// it. /diagnostic/start relies on this to decide "create new" vs "resume".
diagnosticSessionSchema.index(
  { user: 1, course: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export default mongoose.model("DiagnosticSession", diagnosticSessionSchema);
