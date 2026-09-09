import mongoose from "mongoose";

const sourceSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  type: { type: String, enum: ["pdf", "youtube", "docx", "pptx", "audio", "image"], required: true },
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", default: null, index: true },
  title: { type: String, required: true, trim: true },
  status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

sourceSchema.index({ owner: 1, course: 1, createdAt: -1 });

export default mongoose.model("Source", sourceSchema);
