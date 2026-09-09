import logger from "../src/utils/logger.js";
import { buildCourseLearningModel } from "../src/services/learningPipeline.js";

export async function processLearning(job) {
  const { courseId, sourcePdfId } = job.data;
  if (!courseId) throw new Error("courseId is required");
  logger.info({ jobId: job.id, courseId, sourcePdfId }, "Building adaptive learning model");
  return buildCourseLearningModel({ courseId, sourcePdfId });
}
