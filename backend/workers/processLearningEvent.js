import { persistLearningEvent } from "../src/services/adaptiveRuntime.js";
import logger from "../src/utils/logger.js";

export async function processLearningEvent(job) {
  const { userId, courseId, eventId, type, conceptIds, payload, attemptId } = job.data;
  if (!userId || !courseId || !eventId) throw new Error("userId, courseId and eventId are required");
  const result = await persistLearningEvent({
    userId, courseId, eventId, type, conceptIds, payload, attemptId,
  });
  logger.info({ jobId: job.id, eventId, applied: result.applied }, "Learning event processed");
  return result;
}
