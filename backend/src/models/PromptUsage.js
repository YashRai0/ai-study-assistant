import mongoose from "mongoose";

const usageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  promptVersion: { type: String, required: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: "Concept" },
  responseTime: { type: Number },
  quality: { type: Number, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

usageSchema.index({ user: 1, promptVersion: 1 });

export default mongoose.model("PromptUsage", usageSchema);
