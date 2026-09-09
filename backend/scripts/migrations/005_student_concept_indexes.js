import mongoose from "mongoose";
import StudentConcept from "../../src/models/StudentConcept.js";

/**
 * Migration: 005_student_concept_indexes
 * Adds indexes for spaced repetition review queue on StudentConcept
 * Idempotent: Safe to run multiple times
 */

export async function up() {
  try {
    await StudentConcept.collection.createIndex({ user: 1, nextReviewAt: 1 });
    console.log("✓ StudentConcept review indexes created");
  } catch (err) {
    if (err.code === 85) {
      console.log("✓ StudentConcept review indexes already exist");
    } else {
      throw err;
    }
  }
}

export async function down() {
  try {
    await StudentConcept.collection.dropIndex("user_1_nextReviewAt_1");
    console.log("✓ StudentConcept review indexes dropped");
  } catch (err) {
    if (err.code === 27) {
      console.log("✓ StudentConcept review indexes already dropped");
    } else {
      throw err;
    }
  }
}

export default { up, down };
