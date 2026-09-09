import mongoose from "mongoose";
import UserStreak from "../../src/models/UserStreak.js";

/**
 * Migration: 001_create_user_streak
 * Creates UserStreak collection and indexes for streak tracking
 * Idempotent: Safe to run multiple times
 */

export async function up() {
  try {
    // Ensure collection and indexes exist
    await UserStreak.collection.createIndex({ user: 1, course: 1 }, { unique: true });
    console.log("✓ UserStreak indexes created");
  } catch (err) {
    if (err.code === 85) {
      console.log("✓ UserStreak already indexed");
    } else {
      throw err;
    }
  }
}

export async function down() {
  try {
    await UserStreak.collection.dropIndex("user_1_course_1");
    console.log("✓ UserStreak indexes dropped");
  } catch (err) {
    if (err.code === 27) {
      console.log("✓ UserStreak indexes already dropped");
    } else {
      throw err;
    }
  }
}

export default { up, down };
