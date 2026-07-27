import mongoose from "mongoose";

// One shared conversation thread per group (not per-member) — everyone in
// the group sees the same Q&A history, grounded in whatever's been shared
// to the group so far.
const groupChatMessageSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "StudyGroup", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // who asked (role: "user" messages only)
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  ts: { type: Date, default: Date.now },
});

export default mongoose.model("GroupChatMessage", groupChatMessageSchema);
