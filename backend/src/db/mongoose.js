import mongoose from "mongoose";
import logger from "../utils/logger.js";

let gridFsBucket = null;

/**
 * @param {string} [uri] - defaults to process.env.MONGODB_URI. Integration
 *   tests pass an in-memory MongoDB URI here instead, so they never touch
 *   the real database.
 */
export async function connectDb(uri = process.env.MONGODB_URI) {
  await mongoose.connect(uri);
  const { GridFSBucket } = await import("mongodb");
  gridFsBucket = new GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
  logger.info("Connected to MongoDB");
}

export function getBucket() {
  if (!gridFsBucket) throw new Error("GridFS bucket not initialized — call connectDb() first.");
  return gridFsBucket;
}
