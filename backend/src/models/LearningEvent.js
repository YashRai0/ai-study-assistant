import mongoose from "mongoose";

const learningEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  attempt: { type: mongoose.Schema.Types.ObjectId, ref: "Attempt", default: null },
  type: { type: String, enum: ["attempt", "retrieval", "review", "diagnostic"], required: true },
  conceptIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

learningEventSchema.index({ user: 1, eventId: 1 }, { unique: true });
learningEventSchema.index({ user: 1, course: 1, createdAt: -1 });

export default mongoose.model("LearningEvent", learningEventSchema);
