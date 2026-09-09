// Promotes (or demotes) a user to/from the admin role.
//
// Usage:
//   node scripts/setAdminRole.js user@example.com admin
//   node scripts/setAdminRole.js user@example.com student
//
// There's no in-app way to create the first admin on purpose — admin status
// is granted out-of-band by whoever controls the database, not by any API
// call a logged-in user could reach.
import "dotenv/config";
import mongoose from "mongoose";
import User from "../src/models/User.js";

const [, , email, role = "admin"] = process.argv;

if (!email || !["admin", "student"].includes(role)) {
  console.error("Usage: node scripts/setAdminRole.js <email> [admin|student]");
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);

const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { role },
  { new: true }
).select("email role");

if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

console.log(`${user.email} is now: ${user.role}`);
await mongoose.disconnect();
