import mongoose from "mongoose";
import MisconceptionPattern from "../../src/models/MisconceptionPattern.js";

/**
 * Migration: 002_create_misconception_pattern
 * Creates MisconceptionPattern collection for pattern-based misconception detection
 * Idempotent: Safe to run multiple times
 */

export async function up() {
  try {
    await MisconceptionPattern.collection.createIndex({ domain: 1, active: 1 });
    console.log("✓ MisconceptionPattern indexes created");
  } catch (err) {
    if (err.code === 85) {
      console.log("✓ MisconceptionPattern already indexed");
    } else {
      throw err;
    }
  }
}

export async function down() {
  try {
    await MisconceptionPattern.collection.dropIndex("domain_1_active_1");
    console.log("✓ MisconceptionPattern indexes dropped");
  } catch (err) {
    if (err.code === 27) {
      console.log("✓ MisconceptionPattern indexes already dropped");
    } else {
      throw err;
    }
  }
}

export default { up, down };
