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
import GroupChatMessage from "../models/GroupChatMessage.js";
import GroupPdfShare from "../models/GroupPdfShare.js";
import StudyGroup from "../models/StudyGroup.js";
import LearningEvent from "../models/LearningEvent.js";
import Misconception from "../models/Misconception.js";
import MultiChatMessage from "../models/MultiChatMessage.js";
import QuizAttempt from "../models/QuizAttempt.js";
import StudentConcept from "../models/StudentConcept.js";
import StudyPlan from "../models/StudyPlan.js";
import UserStreak from "../models/UserStreak.js";
import AdaptiveMetric from "../models/AdaptiveMetric.js";
import DiagnosticSession from "../models/DiagnosticSession.js";
import InterventionOutcome from "../models/InterventionOutcome.js";
import PromptUsage from "../models/PromptUsage.js";
import Source from "../models/Source.js";
import TutorInteraction from "../models/TutorInteraction.js";
import logger from "../utils/logger.js";

/**
 * Best-effort account deletion covering all user-owned and cascade-dependent records.
 * Not a single all-or-nothing transaction — Mongo transactions don't span GridFS bucket
 * operations, and this touches enough collections that holding one long transaction open
 * across all of them isn't worth the lock contention. Each step is independently safe to
 * retry (all deletes are idempotent — deleting something already gone is a no-op), and any
 * single failure is logged rather than aborting the whole cleanup, so a problem with one
 * collection doesn't leave a user stuck unable to delete their account at all.
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

  // 1. PDFs & derived files: delete the GridFS-stored original bytes,
  // then any group shares referencing these PDFs, chunk embeddings, and the Pdf records.
  const pdfs = await Pdf.find({ owner: userId }).select("_id gridFsFileId").lean();
  const pdfIds = pdfs.map((p) => p._id);
  const bucket = getBucket();
  for (const pdf of pdfs) {
    if (!pdf.gridFsFileId) continue; // no uploaded file for this source (e.g. YouTube) — nothing to delete
    await step(`gridfs:${pdf._id}`, () => bucket.delete(pdf.gridFsFileId));
  }
  if (pdfIds.length) {
    await step("groupPdfShares_byPdfs", () => GroupPdfShare.deleteMany({ pdf: { $in: pdfIds } }));
  }
  await step("chunks", () => Chunk.deleteMany({ owner: userId }));
  await step("pdfs", () => Pdf.deleteMany({ owner: userId }));

  // 2. Courses: their concepts, diagnostic questions, and sources are scoped by course,
  // so they are removed via the owned course IDs.
  const courses = await Course.find({ owner: userId }).select("_id").lean();
  const courseIds = courses.map((c) => c._id);
  if (courseIds.length) {
    await step("diagnosticQuestions", () => DiagnosticQuestion.deleteMany({ course: { $in: courseIds } }));
    await step("concepts", () => Concept.deleteMany({ course: { $in: courseIds } }));
    await step("sources_byCourse", () => Source.deleteMany({ course: { $in: courseIds } }));
  }
  await step("sources_byOwner", () => Source.deleteMany({ owner: userId }));
  await step("courses", () => Course.deleteMany({ owner: userId }));

  // 3. Study Groups:
  // For groups owned by the user: cascade delete all memberships, shares, chat messages, and the group itself.
  const ownedGroups = await StudyGroup.find({ owner: userId }).select("_id").lean();
  const ownedGroupIds = ownedGroups.map((g) => g._id);
  if (ownedGroupIds.length) {
    await step("groupMemberships_ownedGroups", () => GroupMembership.deleteMany({ group: { $in: ownedGroupIds } }));
    await step("groupPdfShares_ownedGroups", () => GroupPdfShare.deleteMany({ group: { $in: ownedGroupIds } }));
    await step("groupChatMessages_ownedGroups", () => GroupChatMessage.deleteMany({ group: { $in: ownedGroupIds } }));
    await step("studyGroups_owned", () => StudyGroup.deleteMany({ owner: userId }));
  }

  // For groups owned by others where the user was a member:
  // remove the user's membership, shares, and chat messages without deleting the group or other members' data.
  await step("groupMemberships_user", () => GroupMembership.deleteMany({ user: userId }));
  await step("groupPdfShares_user", () => GroupPdfShare.deleteMany({ sharedBy: userId }));
  await step("groupChatMessages_user", () => GroupChatMessage.deleteMany({ author: userId }));

  // 4. Everything else directly keyed by user/owner:
  await step("adaptiveMetrics", () => AdaptiveMetric.deleteMany({ user: userId }));
  await step("attempts", () => Attempt.deleteMany({ user: userId }));
  await step("chatMessages", () => ChatMessage.deleteMany({ owner: userId }));
  await step("diagnosticSessions", () => DiagnosticSession.deleteMany({ user: userId }));
  await step("events", () => Event.deleteMany({ user: userId }));
  await step("examSessions", () => ExamSession.deleteMany({ user: userId }));
  await step("flashcards", () => Flashcard.deleteMany({ owner: userId }));
  await step("interventionOutcomes", () => InterventionOutcome.deleteMany({ user: userId }));
  await step("learningEvents", () => LearningEvent.deleteMany({ user: userId }));
  await step("misconceptions", () => Misconception.deleteMany({ user: userId }));
  await step("multiChatMessages", () => MultiChatMessage.deleteMany({ owner: userId }));
  await step("promptUsages", () => PromptUsage.deleteMany({ user: userId }));
  await step("quizAttempts", () => QuizAttempt.deleteMany({ owner: userId }));
  await step("studentConcepts", () => StudentConcept.deleteMany({ user: userId }));
  await step("studyPlans", () => StudyPlan.deleteMany({ owner: userId }));
  await step("tutorInteractions", () => TutorInteraction.deleteMany({ user: userId }));
  await step("userStreaks", () => UserStreak.deleteMany({ user: userId }));

  // 5. Finally, remove the User record itself:
  await step("user", () => User.deleteOne({ _id: userId }));

  return { deleted: errors.length === 0, failedSteps: errors };
}
