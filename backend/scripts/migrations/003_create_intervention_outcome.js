import mongoose from "mongoose";
import InterventionOutcome from "../../src/models/InterventionOutcome.js";

/**
 * Migration: 003_create_intervention_outcome
 * Creates InterventionOutcome collection for tracking intervention effectiveness
 * Idempotent: Safe to run multiple times
 */

export async function up() {
  try {
    await InterventionOutcome.collection.createIndex({ user: 1 });
    await InterventionOutcome.collection.createIndex({ concept: 1 });
    await InterventionOutcome.collection.createIndex({ createdAt: -1 });
    console.log("✓ InterventionOutcome indexes created");
  } catch (err) {
    if (err.code === 85) {
      console.log("✓ InterventionOutcome already indexed");
    } else {
      throw err;
    }
  }
}

export async function down() {
  try {
    await InterventionOutcome.collection.dropIndex("user_1");
    await InterventionOutcome.collection.dropIndex("concept_1");
    await InterventionOutcome.collection.dropIndex("createdAt_-1");
    console.log("✓ InterventionOutcome indexes dropped");
  } catch (err) {
    if (err.code === 27) {
      console.log("✓ InterventionOutcome indexes already dropped");
    } else {
      throw err;
    }
  }
}

export default { up, down };
