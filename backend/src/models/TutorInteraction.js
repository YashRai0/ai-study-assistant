import mongoose from "mongoose";

// Persists what the server actually asked in a tutoring turn, so
// /tutor/respond can grade the student's answer against what was really
// generated rather than trusting the client to resubmit the question,
// strategy, and course faithfully. See routes/learning.js's /tutor/next
// and /tutor/respond for how this is used, and the comment on
// /attempts/evaluate for the matching fix on that route.
//
// `status` doubles as the idempotency guard: /tutor/respond atomically
// flips pending -> completed exactly once (a conditional update inside a
// transaction), so a retried request can detect it already happened
// without needing a separate client-supplied idempotency key.
const tutorInteractionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  concept: { type: mongoose.Schema.Types.ObjectId, ref: "Concept", required: true, index: true },
  strategy: { type: String, enum: ["misconception_confrontation", "direct_instruction", "socratic_probe", "worked_example", "test_transfer"], required: true },
  content: { type: String, default: "" },
  question: { type: String, default: null },
  reason: { type: String, default: "" },
  status: { type: String, enum: ["pending", "completed"], default: "pending", index: true },
}, { timestamps: true });

export default mongoose.model("TutorInteraction", tutorInteractionSchema);
