import mongoose from "mongoose";

const conceptSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  importance: { type: Number, min: 0, max: 1, default: 0.5 },
  difficulty: { type: Number, min: 1, max: 5, default: 3 },
  prerequisites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  relatedConcepts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  // Stronger prerequisite: the referencing concept's definition/mechanism
  // directly requires this one (e.g. Krebs Cycle dependsOn Pyruvate
  // Oxidation), vs. `prerequisites` which is broader "should learn first".
  dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  // Inverse-ish of dependsOn: mastering this concept reinforces/enables
  // that one (e.g. Glycolysis supports Cellular Respiration).
  supports: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  // Concepts students tend to mix up because they're structurally similar
  // but meaningfully different (e.g. Mitosis contrastsWith Meiosis) — used
  // to prompt explicit compare/contrast practice.
  contrastsWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  // Concepts whose misconceptions bleed into each other in practice (e.g.
  // students confuse "weight" with "mass") — distinct from contrastsWith,
  // which is about the concepts themselves being similar; this is about
  // observed student confusion between them regardless of similarity.
  commonlyConfusedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: "Concept" }],
  aliases: [{ type: String, trim: true }],
  sourceRefs: [{ sourceId: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf" }, page: Number, chunkId: mongoose.Schema.Types.ObjectId }],
}, { timestamps: true });

conceptSchema.index({ course: 1, name: 1 }, { unique: true });

export default mongoose.model("Concept", conceptSchema);
