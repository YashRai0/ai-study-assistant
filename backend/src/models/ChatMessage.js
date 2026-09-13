import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema({
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  sources: [
    {
      filename: String,
      page: Number,
      score: Number,
      excerpt: String,
    },
  ],
  confidence: {
    type: String,
    enum: ["HIGH", "MEDIUM", "LOW"],
    default: "HIGH",
  },
  ts: { type: Date, default: Date.now },
});

export default mongoose.model("ChatMessage", chatMessageSchema);
