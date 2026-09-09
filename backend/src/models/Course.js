import mongoose from "mongoose";

const courseSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true },
  subject: { type: String, default: "General", trim: true },
  examDate: { type: Date, default: null },
  targetScore: { type: Number, min: 0, max: 100, default: null },
  status: { type: String, enum: ["active", "archived"], default: "active" },
}, { timestamps: true });

courseSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model("Course", courseSchema);
