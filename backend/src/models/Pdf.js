import mongoose from "mongoose";

// Chunks + embeddings live in their own collection (see Chunk.js) — keeping
// them here would let a single PDF document grow toward MongoDB's 16MB
// document limit on a long PDF, and forces every query that only needs
// metadata (like the Dashboard list) to load every chunk's embedding vector
// too. fullText stays here since it's needed whole for summary/flashcard/
// quiz generation and is far smaller than the embedding data ever was.
const pdfSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  filename: { type: String, required: true },
  subject: { type: String, default: "General", trim: true, index: true },
  extractionMethod: { type: String, enum: ["text", "ocr"], default: "text" },
  contentHash: { type: String, required: true }, // SHA-256 of the raw file bytes, for duplicate detection
  gridFsFileId: { type: mongoose.Schema.Types.ObjectId, required: true }, // original PDF bytes, stored via GridFS
  fullText: { type: String, required: true },
  chunkCount: { type: Number, default: 0 }, // avoids a Chunk count query just to show this on the Dashboard
  uploadedAt: { type: Date, default: Date.now },
});

// Prevents the same user from ending up with duplicate embeddings for a file
// they've already uploaded (re-uploading the same PDF, or a name-only rename).
pdfSchema.index({ owner: 1, contentHash: 1 }, { unique: true });

export default mongoose.model("Pdf", pdfSchema);
