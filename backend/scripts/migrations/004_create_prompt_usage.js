import mongoose from "mongoose";
import PromptUsage from "../../src/models/PromptUsage.js";

/**
 * Migration: 004_create_prompt_usage
 * Creates PromptUsage collection for A/B testing tutoring prompts
 * Idempotent: Safe to run multiple times
 */

export async function up() {
  try {
    await PromptUsage.collection.createIndex({ user: 1, promptVersion: 1 });
    await PromptUsage.collection.createIndex({ createdAt: -1 });
    console.log("✓ PromptUsage indexes created");
  } catch (err) {
    if (err.code === 85) {
      console.log("✓ PromptUsage already indexed");
    } else {
      throw err;
    }
  }
}

export async function down() {
  try {
    await PromptUsage.collection.dropIndex("user_1_promptVersion_1");
    await PromptUsage.collection.dropIndex("createdAt_-1");
    console.log("✓ PromptUsage indexes dropped");
  } catch (err) {
    if (err.code === 27) {
      console.log("✓ PromptUsage indexes already dropped");
    } else {
      throw err;
    }
  }
}

export default { up, down };
