import mongoose from "mongoose";

// One document per chunk, in its own collection — the fix for the biggest
// scalability issue in the previous design (chunks + embeddings embedded
// inside the Pdf document, which could approach MongoDB's 16MB document
// limit on a long PDF, and made every Pdf query load embedding data it
// didn't need).
//
// subject and filename are denormalized from the parent Pdf here on purpose:
// multi-document chat and search filter/group by subject across potentially
// thousands of chunks, and doing that without a join on every request is
// worth the duplication. There's no "rename a PDF's subject" feature yet —
// if one gets added later, it needs to update Chunk docs too, not just Pdf.
const chunkSchema = new mongoose.Schema({
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  subject: { type: String, required: true, index: true },
  filename: { type: String, required: true },
  page: { type: Number, required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true },
  // SHA-256 of `text`, distinct from Pdf.contentHash (which hashes the raw
  // uploaded file for duplicate-upload detection, not per-chunk text).
  // Lets a retried embedding job recognize a chunk whose text is unchanged
  // from a previous attempt and reuse its embedding instead of paying for
  // the embedding model again — see workers/processEmbedChunks.js.
  contentHash: { type: String, index: true },
});

chunkSchema.index({ owner: 1, subject: 1 });
chunkSchema.index({ pdf: 1, contentHash: 1 });
chunkSchema.index({ pdf: 1, owner: 1 });

export default mongoose.model("Chunk", chunkSchema);

