import mongoose from "mongoose";

const studyGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subject: { type: String, default: "General", trim: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  inviteCode: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("StudyGroup", studyGroupSchema);
