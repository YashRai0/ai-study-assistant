import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  name: { type: String, trim: true, maxlength: 100, default: "" },
  notificationsEnabled: { type: Boolean, default: true },
  emailFrequency: { type: String, enum: ["daily", "weekly", "never"], default: "daily" },
  dataSharing: { type: Boolean, default: false },
  // Password-reset flow: a hash of the reset token (never the raw token —
  // same reasoning as passwordHash) plus its expiry.
  resetTokenHash: { type: String, default: null, select: false },
  resetExpires: { type: Date, default: null, select: false },
  // Tokens issued before this timestamp are rejected by requireAuth — see
  // "revoke all tokens" in authService.js.
  tokenRevokedAt: { type: Date, default: null, select: false },
  createdAt: { type: Date, default: Date.now },
});

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 10);
};

userSchema.methods.checkPassword = function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

// A hash of a value nobody will ever type, used to keep login response
// timing constant whether or not the email exists — see the timing note
// in routes/auth.js.
userSchema.statics.dummyPasswordHash = bcrypt.hashSync("no-such-account-placeholder", 10);

export default mongoose.model("User", userSchema);
