import mongoose from "mongoose";

// SM-2 spaced-repetition fields (the same algorithm behind SuperMemo/Anki):
// easeFactor governs how quickly intervals grow for cards you find easy,
// interval is the current gap (in days) until the next review, repetitions
// counts consecutive successful reviews (reset to 0 on a failed recall).
// New cards default to nextReviewDate = now, so they're immediately due.
const flashcardSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", required: true, index: true },
  subject: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  front: { type: String, required: true },
  back: { type: String, required: true },
  easeFactor: { type: Number, default: 2.5 },
  interval: { type: Number, default: 0 }, // days
  repetitions: { type: Number, default: 0 },
  nextReviewDate: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Flashcard", flashcardSchema);
