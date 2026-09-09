import { getBucket } from "../db/mongoose.js";
import User from "../models/User.js";
import Pdf from "../models/Pdf.js";
import Chunk from "../models/Chunk.js";
import Course from "../models/Course.js";
import Concept from "../models/Concept.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import Attempt from "../models/Attempt.js";
import ChatMessage from "../models/ChatMessage.js";
import Event from "../models/Event.js";
import ExamSession from "../models/ExamSession.js";
import Flashcard from "../models/Flashcard.js";
import GroupMembership from "../models/GroupMembership.js";
import LearningEvent from "../models/LearningEvent.js";
import Misconception from "../models/Misconception.js";
import MultiChatMessage from "../models/MultiChatMessage.js";
import QuizAttempt from "../models/QuizAttempt.js";
import StudentConcept from "../models/StudentConcept.js";
import StudyPlan from "../models/StudyPlan.js";
import UserStreak from "../models/UserStreak.js";
import logger from "../utils/logger.js";

/**
 * Best-effort account deletion. Not a single all-or-nothing transaction —
 * Mongo transactions don't span GridFS bucket operations, and this touches
 * enough collections that holding one long transaction open across all of
 * them isn't worth the lock contention. Each step is independently safe to
 * retry (all deletes are idempotent — deleting something already gone is a
 * no-op), and any single failure is logged rather than aborting the whole
 * cleanup, so a problem with one collection doesn't leave a user stuck
 * unable to delete their account at all.
 */
export async function deleteUserAccount(userId) {
  const errors = [];
  const step = async (label, fn) => {
    try {
      await fn();
    } catch (err) {
      logger.error({ userId, step: label, err }, "Account deletion step failed");
      errors.push(label);
    }
  };

  // PDFs: delete the GridFS-stored original bytes, then the chunk text/
  // embeddings derived from them, then the Pdf documents themselves.
  const pdfs = await Pdf.find({ owner: userId }).select("_id gridFsFileId").lean();
  const bucket = getBucket();
  for (const pdf of pdfs) {
    if (!pdf.gridFsFileId) continue; // no uploaded file for this source (e.g. YouTube) — nothing to delete
    await step(`gridfs:${pdf._id}`, () => bucket.delete(pdf.gridFsFileId));
  }
  await step("chunks", () => Chunk.deleteMany({ owner: userId }));
  await step("pdfs", () => Pdf.deleteMany({ owner: userId }));

  // Courses: their concepts and diagnostic questions are scoped by course,
  // not directly by user, so they're removed via the owned course ids.
  const courses = await Course.find({ owner: userId }).select("_id").lean();
  const courseIds = courses.map((c) => c._id);
  if (courseIds.length) {
    await step("diagnosticQuestions", () => DiagnosticQuestion.deleteMany({ course: { $in: courseIds } }));
    await step("concepts", () => Concept.deleteMany({ course: { $in: courseIds } }));
  }
  await step("courses", () => Course.deleteMany({ owner: userId }));

  // Everything else keyed directly by user/owner.
  await step("attempts", () => Attempt.deleteMany({ user: userId }));
  await step("chatMessages", () => ChatMessage.deleteMany({ owner: userId }));
  await step("events", () => Event.deleteMany({ user: userId }));
  await step("examSessions", () => ExamSession.deleteMany({ user: userId }));
  await step("flashcards", () => Flashcard.deleteMany({ owner: userId }));
  await step("groupMemberships", () => GroupMembership.deleteMany({ user: userId }));
  await step("learningEvents", () => LearningEvent.deleteMany({ user: userId }));
  await step("misconceptions", () => Misconception.deleteMany({ user: userId }));
  await step("multiChatMessages", () => MultiChatMessage.deleteMany({ owner: userId }));
  await step("quizAttempts", () => QuizAttempt.deleteMany({ owner: userId }));
  await step("studentConcepts", () => StudentConcept.deleteMany({ user: userId }));
  await step("studyPlans", () => StudyPlan.deleteMany({ owner: userId }));
  await step("userStreaks", () => UserStreak.deleteMany({ user: userId }));

  await step("user", () => User.deleteOne({ _id: userId }));

  return { deleted: errors.length === 0, failedSteps: errors };
}
