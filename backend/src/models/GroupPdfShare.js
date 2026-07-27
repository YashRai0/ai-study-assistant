import mongoose from "mongoose";

// A many-to-many join between StudyGroup and Pdf: sharing a PDF to a group
// doesn't copy or move it — the original owner still owns it, this just
// makes it visible (and part of the group's shared chunk pool for group
// chat) to everyone in the group.
const groupPdfShareSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "StudyGroup", required: true, index: true },
  pdf: { type: mongoose.Schema.Types.ObjectId, ref: "Pdf", required: true, index: true },
  sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sharedAt: { type: Date, default: Date.now },
});

groupPdfShareSchema.index({ group: 1, pdf: 1 }, { unique: true });

export default mongoose.model("GroupPdfShare", groupPdfShareSchema);
