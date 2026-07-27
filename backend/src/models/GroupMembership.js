import mongoose from "mongoose";

// Separate collection rather than an embedded members array on StudyGroup —
// same reasoning as the Chunk/Pdf split earlier in this project: keeps the
// group document small regardless of member count, and makes "which groups
// is user X in" / "who's in group Y" both simple indexed queries instead of
// scans through an array field.
const groupMembershipSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: "StudyGroup", required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  role: { type: String, enum: ["owner", "member"], default: "member" },
  joinedAt: { type: Date, default: Date.now },
});

groupMembershipSchema.index({ group: 1, user: 1 }, { unique: true });

export default mongoose.model("GroupMembership", groupMembershipSchema);
