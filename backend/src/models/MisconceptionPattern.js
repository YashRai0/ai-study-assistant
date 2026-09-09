import mongoose from "mongoose";

const patternSchema = new mongoose.Schema({
  domain: { type: String, enum: ["biology", "chemistry", "physics", "math", "english"], required: true, index: true },
  pattern: { type: String, required: true },
  description: { type: String },
  regex: { type: String },
  keywords: [String],
  severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  examples: [String],
  active: { type: Boolean, default: true, index: true },
}, { timestamps: true });

export default mongoose.model("MisconceptionPattern", patternSchema);
