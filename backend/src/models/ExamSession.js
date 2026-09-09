import mongoose from "mongoose";

const examAnswerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "DiagnosticQuestion", required: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true },
  correct: { type: Boolean, required: true },
  score: { type: Number, min: 0, max: 1, required: true },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  confidence: { type: Number, min: 1, max: 5, default: 3 },
  misconception: { type: String, default: null },
  answeredAt: { type: Date, default: Date.now },
}, { _id: false });

const examSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  status: { type: String, enum: ["in_progress", "completed"], default: "in_progress" },
  // Frozen at start time from the priority ranking, so concept selection
  // doesn't silently reshuffle mid-exam as mastery updates from the very
  // answers the student is giving right now.
  conceptQueue: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  currentIndex: { type: Number, default: 0 },
  // Adaptive difficulty target (1-5), stairsteps up on a correct answer and
  // down on an incorrect one — see services/examSimulator.js.
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  answers: [examAnswerSchema],
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

examSessionSchema.index({ user: 1, course: 1, status: 1 });

export default mongoose.model("ExamSession", examSessionSchema);
