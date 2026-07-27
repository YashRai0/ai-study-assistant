import mongoose from "mongoose";

// A completed, self-graded quiz attempt. Only the objective parts (MCQ,
// True/False) contribute to score/total — short-answer questions are shown
// with a model answer for self-checking but aren't auto-graded, so they're
// not counted toward the numeric score.
const quizAttemptSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", required: true, index: true },
  subject: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  takenAt: { type: Date, default: Date.now, index: true },
});

export default mongoose.model("QuizAttempt", quizAttemptSchema);
