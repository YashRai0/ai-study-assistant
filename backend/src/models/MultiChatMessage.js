import mongoose from "mongoose";

// Chat history for cross-document conversations, keyed by "scope" instead of
// a single pdf. scope is either "All subjects" or one specific subject name —
// this keeps a separate conversation thread per subject, same as per-PDF chat
// keeps a separate thread per PDF.
const multiChatMessageSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  scope: { type: String, required: true, index: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  ts: { type: Date, default: Date.now },
});

export default mongoose.model("MultiChatMessage", multiChatMessageSchema);
