import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import Course from "../models/Course.js";
import Source from "../models/Source.js";
import Concept from "../models/Concept.js";
import Attempt from "../models/Attempt.js";
import Misconception from "../models/Misconception.js";
import DiagnosticQuestion from "../models/DiagnosticQuestion.js";
import DiagnosticSession from "../models/DiagnosticSession.js";
import { evaluateFreeResponse, generateTutorIntervention } from "../services/llm.js";
import { decideInterventionStrategy } from "../services/adaptiveTutor.js";
import InterventionOutcome from "../models/InterventionOutcome.js";
import TutorInteraction from "../models/TutorInteraction.js";
import LearningEvent from "../models/LearningEvent.js";

// InterventionOutcome's interventionType enum uses nextAction.js's coarser
// action vocabulary (TEACH/REVIEW/TEST/MISCONCEPTION_FIX/PREREQUISITE_GAP);
// the tutor engine's strategies are a finer-grained vocabulary for HOW to
// teach. This maps one onto the other for persistence rather than growing
// InterventionOutcome's enum to duplicate adaptiveTutor.js's STRATEGIES.
const STRATEGY_TO_ACTION_TYPE = {
  misconception_confrontation: "MISCONCEPTION_FIX",
  direct_instruction: "TEACH",
  socratic_probe: "TEACH",
  worked_example: "TEACH",
  test_transfer: "TEST",
};
import StudentConcept from "../models/StudentConcept.js";
import { recordAttempt, calculateForgettingRisk } from "../services/mastery.js";
import { assessMisconceptionRisk, normalizeDomain } from "../services/misconceptionDetection.js";
import { selectNextDiagnosticQuestion } from "../services/diagnosticEngine.js";
import { getNextAction } from "../services/nextAction.js";
import { getAdaptiveCourseState, getNextStudyItem, evaluateQuestionAnswer, recordDurableAttempt, findQuestionForConcept } from "../services/adaptiveRuntime.js";
import { buildStudySessionPlan } from "../services/studySession.js";
import { requireRole } from "../middleware/requireRole.js";
import { deduplicateConceptsInCourse } from "../services/conceptDedup.js";
import { seedMisconceptionPatterns } from "../services/misconceptionDetection.js";
import MisconceptionPattern from "../models/MisconceptionPattern.js";
import { getStreak } from "../services/streakService.js";
import UserStreak from "../models/UserStreak.js";
import { generateStructuredTutorResponse } from "../services/tutorResponse.js";
import { calculateExamReadiness } from "../services/examReadiness.js";

const router = Router();
router.use(requireAuth);

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid ID");
const courseSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().max(100).optional(),
  examDate: z.string().datetime().optional().nullable(),
  targetScore: z.number().min(0).max(100).optional().nullable(),
});
const conceptSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  importance: z.number().min(0).max(1).optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  aliases: z.array(z.string().max(100)).max(20).optional(),
});
const durableAttemptSchema = z.object({
  courseId: objectId,
  questionId: objectId,
  answer: z.string().max(20000),
  confidence: z.number().int().min(1).max(5),
  responseTimeMs: z.number().int().min(0).optional().nullable(),
  hintUsed: z.boolean().optional(),
  eventId: z.string().trim().min(8).max(200).optional(),
  diagnosticSessionId: objectId.optional(),
});

router.get("/courses", async (req, res) => {
  const courses = await Course.find({ owner: req.user.id }).sort({ createdAt: -1 }).lean();
  res.json({ courses });
});

router.post("/courses", validate(courseSchema), async (req, res) => {
  const course = await Course.create({ owner: req.user.id, ...req.body, examDate: req.body.examDate ? new Date(req.body.examDate) : null });
  res.status(201).json({ course });
});

router.get("/courses/:courseId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.findOne({ _id: req.params.courseId, owner: req.user.id }).lean();
  if (!course) return res.status(404).json({ error: "Course not found." });
  res.json({ course });
});

const courseUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  subject: z.string().max(100).optional(),
  examDate: z.string().datetime().optional().nullable(),
  targetScore: z.number().min(0).max(100).optional().nullable(),
});

router.patch("/courses/:courseId", validate(courseUpdateSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const updates = { ...req.body };
  if ("examDate" in updates) updates.examDate = updates.examDate ? new Date(updates.examDate) : null;
  const course = await Course.findOneAndUpdate(
    { _id: req.params.courseId, owner: req.user.id },
    updates,
    { new: true }
  ).lean();
  if (!course) return res.status(404).json({ error: "Course not found." });
  res.json({ course });
});

router.get("/courses/:courseId/concepts", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const concepts = await Concept.find({ course: req.params.courseId })
    .populate("prerequisites relatedConcepts dependsOn supports contrastsWith commonlyConfusedWith", "name")
    .populate("sourceRefs.sourceId", "filename")
    .sort({ importance: -1, name: 1 })
    .lean();
  res.json({ concepts });
});

router.post("/courses/:courseId/concepts", validate(conceptSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  try {
    const concept = await Concept.create({ course: req.params.courseId, ...req.body });
    res.status(201).json({ concept });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "That concept already exists in this course." });
    throw err;
  }
});

router.get("/courses/:courseId/mastery", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const mastery = await StudentConcept.find({ user: req.user.id, course: req.params.courseId }).populate("concept", "name importance difficulty").sort({ mastery: 1 }).lean();
  res.json({ mastery });
});

router.get("/courses/:courseId/next-action", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const action = await getNextAction({ userId: req.user.id, courseId: req.params.courseId });
  if (!action) return res.status(404).json({ error: "Course not found." });
  res.json({ action });
});


router.get("/courses/:courseId/diagnostic", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const questions = await DiagnosticQuestion.find({ course: req.params.courseId, active: true })
    .populate("conceptIds", "name difficulty")
    .select("_id course conceptIds question type options difficulty explanation cognitiveLevel")
    .sort({ difficulty: 1, createdAt: 1 })
    .lean();
  res.json({ questions });
});

const diagnosticNextSchema = z.object({
  sessionId: objectId,
});

// Creates (or resumes) the one active diagnostic session for this
// user+course — the partial unique index on DiagnosticSession enforces
// there's never more than one, so a double-click or a second browser tab
// resumes the same session rather than starting a parallel one.
router.post("/courses/:courseId/diagnostic/start", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });

  let session = await DiagnosticSession.findOne({ user: req.user.id, course: req.params.courseId, status: "active" });
  if (!session) {
    try {
      session = await DiagnosticSession.create({ user: req.user.id, course: req.params.courseId });
    } catch (err) {
      // Lost a race against a concurrent /diagnostic/start for the same
      // user+course (e.g. a double-click) — the unique partial index
      // rejected the second create. Fetch the one that won instead of
      // erroring.
      if (err?.code === 11000) {
        session = await DiagnosticSession.findOne({ user: req.user.id, course: req.params.courseId, status: "active" });
      } else {
        throw err;
      }
    }
  }

  const [concepts, questions] = await Promise.all([
    Concept.find({ course: req.params.courseId }).select("_id name importance prerequisites dependsOn").lean(),
    DiagnosticQuestion.find({ course: req.params.courseId, active: true })
      .select("_id conceptIds question type options difficulty explanation cognitiveLevel createdAt attemptStats")
      .lean(),
  ]);

  const answered = session.answers.map((a) => ({ questionId: a.questionId, correct: a.correct }));
  const result = selectNextDiagnosticQuestion({ concepts, questions, answered, maxQuestions: session.maxQuestions });
  if (result.question) delete result.question.attemptStats;

  session.currentQuestionId = result.question?._id || null;
  if (result.done && session.status === "active") {
    session.status = "completed";
    session.completedAt = new Date();
  }
  await session.save();

  res.json({ ...result, sessionId: session._id, resumed: session.answers.length > 0, answeredCount: session.answers.length });
});

// Returns the active diagnostic session for this course, if any — lets
// the frontend offer "resume" instead of silently starting a second
// diagnostic on page reload after an interrupted one.
router.get("/courses/:courseId/diagnostic/session", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const session = await DiagnosticSession.findOne({ user: req.user.id, course: req.params.courseId, status: "active" })
    .select("_id answers startedAt maxQuestions")
    .lean();
  res.json({ session: session ? { sessionId: session._id, answeredCount: session.answers.length, maxQuestions: session.maxQuestions, startedAt: session.startedAt } : null });
});

// Adaptive diagnostic: returns ONE question at a time instead of a fixed
// pre-generated batch — which concept and difficulty to probe next
// depends on everything answered so far in this session (see
// diagnosticEngine.js). The session's answer history is now the source of
// truth (see DiagnosticSession/recordDurableAttempt's diagnosticSessionId
// handling) rather than a client-supplied `answered[]` array the caller
// could have sent anything in.
router.post("/courses/:courseId/diagnostic/next", validate(diagnosticNextSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });

  const session = await DiagnosticSession.findOne({
    _id: req.body.sessionId, user: req.user.id, course: req.params.courseId,
  });
  if (!session) return res.status(404).json({ error: "Diagnostic session not found." });
  if (session.status !== "active") {
    return res.json({ done: true, reason: "session_already_completed" });
  }

  const [concepts, questions] = await Promise.all([
    Concept.find({ course: req.params.courseId })
      .select("_id name importance prerequisites dependsOn")
      .lean(),
    // Deliberately excludes `answer` — the diagnostic engine only needs
    // conceptIds/difficulty/cognitiveLevel to pick a question, and the
    // correct answer must never reach the client before they respond
    // (see the removed-endpoint note near /attempts/durable for why that
    // matters here).
    DiagnosticQuestion.find({ course: req.params.courseId, active: true })
      .select("_id conceptIds question type options difficulty explanation cognitiveLevel createdAt attemptStats")
      .lean(),
  ]);

  const answered = session.answers.map((a) => ({ questionId: a.questionId, correct: a.correct }));
  const result = selectNextDiagnosticQuestion({ concepts, questions, answered, maxQuestions: session.maxQuestions });
  if (result.question) delete result.question.attemptStats;

  session.currentQuestionId = result.question?._id || null;
  if (result.done) {
    session.status = "completed";
    session.completedAt = new Date();
  }
  await session.save();

  res.json(result);
});

const tutorNextSchema = z.object({
  priorInterventions: z.array(z.object({
    strategy: z.enum(["misconception_confrontation", "direct_instruction", "socratic_probe", "worked_example", "test_transfer"]),
    outcome: z.enum(["success", "partial", "failure"]),
  })).max(20).default([]),
});

// Decides and generates the next tutor intervention for one concept —
// the "decide" + "execute" halves of adaptiveTutor.js's loop. Stateless
// like the diagnostic endpoint: the client holds this session's
// intervention history for this concept and resends it, so the decision
// can escalate (Socratic -> worked example -> direct instruction) based
// on what's already been tried rather than picking blind each time.
router.post("/courses/:courseId/concepts/:conceptId/tutor/next", validate(tutorNextSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId) || !mongoose.isValidObjectId(req.params.conceptId)) {
    return res.status(400).json({ error: "Invalid ID." });
  }
  const [course, concept] = await Promise.all([
    Course.exists({ _id: req.params.courseId, owner: req.user.id }),
    Concept.findOne({ _id: req.params.conceptId, course: req.params.courseId }).select("name").lean(),
  ]);
  if (!course || !concept) return res.status(404).json({ error: "Course or concept not found." });

  const [state, misconception] = await Promise.all([
    StudentConcept.findOne({ user: req.user.id, course: req.params.courseId, concept: req.params.conceptId })
      .select("mastery misconceptionRisk").lean(),
    Misconception.findOne({ user: req.user.id, course: req.params.courseId, concept: req.params.conceptId, resolved: false })
      .select("description risk").sort({ risk: -1 }).lean(),
  ]);

  const decision = decideInterventionStrategy({
    mastery: state?.mastery ?? 0,
    misconceptionRisk: misconception?.risk ?? state?.misconceptionRisk ?? 0,
    priorInterventions: req.body.priorInterventions,
  });

  const intervention = await generateTutorIntervention({
    concept: concept.name,
    strategy: decision.strategy,
    misconception: misconception?.description ?? null,
  });

  // Persisted so /tutor/respond can grade against what was actually asked
  // instead of trusting the client to resend it faithfully — see
  // TutorInteraction's model comment.
  const interaction = await TutorInteraction.create({
    user: req.user.id,
    course: req.params.courseId,
    concept: req.params.conceptId,
    strategy: decision.strategy,
    content: intervention.content,
    question: intervention.question,
    reason: decision.reason,
  });

  res.json({ ...intervention, reason: decision.reason, interactionId: interaction._id });
});

const tutorRespondSchema = z.object({
  interactionId: objectId,
  answer: z.string().max(20000),
  confidence: z.number().int().min(1).max(5),
});

// Evaluates the student's response to an intervention, closes the loop
// (Student Model -> ... -> Evaluate -> Student Model) by feeding the
// result back into the same mastery/misconception pipeline
// /attempts/evaluate uses, and records an InterventionOutcome so future
// decisions — and any dashboard built on top of this later — have a real
// history to work from instead of this being a one-shot interaction.
//
// Takes only `interactionId` + the student's `answer`/`confidence` — it
// used to also take `courseId`, `strategy`, `question`, and an optional
// `expectedAnswer` straight from the client, which is exactly the ground-
// truth-trust hole described on /attempts/evaluate above, just here it was
// the question itself (not merely the answer key) that the client could
// substitute. course/concept/strategy/question now all come from the
// TutorInteraction /tutor/next persisted, looked up by interactionId.
//
// Idempotent via TutorInteraction.status: pending -> completed is an
// atomic conditional update inside the transaction below, so a retried
// request (double-click, client retry) can't record a second mastery
// update for the same interaction — no separate client-supplied
// idempotency key needed, since interactionId already uniquely identifies
// "this one pending question."
router.post("/courses/:courseId/concepts/:conceptId/tutor/respond", validate(tutorRespondSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.conceptId)) return res.status(400).json({ error: "Invalid concept ID." });

  const course = await Course.findOne({ _id: req.params.courseId, owner: req.user.id }).select("subject").lean();
  if (!course) return res.status(404).json({ error: "Course not found." });

  const interaction = await TutorInteraction.findOne({
    _id: req.body.interactionId,
    user: req.user.id,
    course: req.params.courseId,
    concept: req.params.conceptId,
  }).lean();
  if (!interaction) return res.status(404).json({ error: "Tutor interaction not found." });

  const eventId = `tutor:${interaction._id}`;

  if (interaction.status === "completed") {
    const existingOutcome = await InterventionOutcome.findOne({ user: req.user.id, eventId }).lean();
    return res.json({ applied: false, outcome: existingOutcome?.outcome ?? null, masteryDelta: existingOutcome?.masteryDelta ?? 0 });
  }

  const before = await StudentConcept.findOne({ user: req.user.id, course: req.params.courseId, concept: req.params.conceptId })
    .select("mastery").lean();
  const masteryBefore = before?.mastery ?? 0;

  // No fixed canonical answer exists for an open tutoring prompt the way
  // it does for a DiagnosticQuestion — grade against the intervention's
  // own content (what a good response should engage with), not something
  // the client supplied.
  const evaluation = await evaluateFreeResponse({
    question: interaction.question || interaction.content,
    answer: req.body.answer,
    expectedAnswer: interaction.content,
    context: "",
  });

  let misconceptionRisk = 0;
  if (!evaluation.correct && evaluation.misconception) {
    const assessment = await assessMisconceptionRisk({
      answer: req.body.answer,
      domain: normalizeDomain(course.subject),
      userId: req.user.id, courseId: req.params.courseId, conceptId: req.params.conceptId,
      llmMisconception: evaluation.misconception,
      llmSeverity: evaluation.misconceptionSeverity,
    });
    misconceptionRisk = assessment.risk;
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      // Atomically claim this interaction — succeeds at most once even if
      // two requests for the same interactionId race each other.
      const claimed = await TutorInteraction.findOneAndUpdate(
        { _id: interaction._id, status: "pending" },
        { $set: { status: "completed" } },
        { session }
      );
      if (!claimed) {
        const existingOutcome = await InterventionOutcome.findOne({ user: req.user.id, eventId }).session(session).lean();
        result = { applied: false, outcome: existingOutcome?.outcome ?? null, masteryDelta: existingOutcome?.masteryDelta ?? 0 };
        return;
      }

      const mastery = await recordAttempt({
        userId: req.user.id, courseId: req.params.courseId, conceptIds: [req.params.conceptId],
        score: evaluation.score, correct: evaluation.correct,
        confidence: req.body.confidence, difficulty: 3, misconceptionRisk,
        session,
      });
      const masteryAfter = mastery?.[0]?.mastery ?? masteryBefore;
      const outcome = evaluation.correct ? "success" : evaluation.score >= 0.4 ? "partial" : "failure";
      const masteryDelta = masteryAfter - masteryBefore;

      await InterventionOutcome.create([{
        user: req.user.id, concept: req.params.conceptId, eventId,
        interventionType: STRATEGY_TO_ACTION_TYPE[interaction.strategy] || "TEACH",
        strategy: interaction.strategy,
        interaction: interaction._id,
        outcome, masteryDelta,
      }], { session });

      result = { applied: true, evaluation, outcome, masteryDelta, mastery: masteryAfter };
    });
  } catch (err) {
    // Two concurrent transactions can both pass the "already completed?"
    // check above and then race on the pending -> completed claim — the
    // loser's findOneAndUpdate simply returns null (no unique-index error
    // to catch here, unlike /attempts/evaluate), so this only needs to
    // guard the InterventionOutcome insert itself in the rare case a
    // duplicate slips through some other way.
    if (err?.code === 11000) {
      const existing = await InterventionOutcome.findOne({ user: req.user.id, eventId }).lean();
      if (existing) {
        result = { applied: false, outcome: existing.outcome, masteryDelta: existing.masteryDelta };
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  res.json(result);
});

const evaluateSchema = z.object({
  questionId: objectId,
  answer: z.string().max(20000),
  confidence: z.number().int().min(1).max(5),
  eventId: z.string().trim().min(8).max(200).optional(),
});

// Server-authoritative free-response grading. This used to take
// `conceptIds`, `question`, `expectedAnswer`, and `difficulty` straight
// from the client — the same trust hole the removed plain POST /attempts
// route above had (see that comment): a client could submit a
// question/answer pair engineered to grade as correct, and point
// `conceptIds` at any concept in the course, crediting mastery nobody
// actually earned. The client now supplies only `questionId` + their
// `answer` + `confidence`; question text, concepts, and the canonical
// answer used for grading all come from the stored DiagnosticQuestion.
// This keeps LLM free-response grading (evaluateFreeResponse tolerates
// paraphrased/partial answers, unlike /attempts/durable's exact-match
// evaluateQuestionAnswer) without trusting the client for ground truth.
//
// Idempotent on (user, eventId), same contract as /attempts/durable: a
// retried request returns the already-recorded attempt instead of
// grading the answer again and double-applying its mastery update.
router.post("/attempts/evaluate", validate(evaluateSchema), async (req, res) => {
  const eventId = req.body.eventId || req.get("Idempotency-Key");
  if (!eventId) return res.status(400).json({ error: "An Idempotency-Key or eventId is required." });

  const question = await DiagnosticQuestion.findById(req.body.questionId).lean();
  if (!question) return res.status(404).json({ error: "Question not found." });
  const course = await Course.findOne({ _id: question.course, owner: req.user.id }).select("subject").lean();
  if (!course) return res.status(404).json({ error: "Course not found." });
  const courseId = question.course;
  const conceptIds = question.conceptIds;
  const difficulty = question.difficulty ?? 3;

  const existingAttempt = await Attempt.findOne({ user: req.user.id, eventId }).lean();
  if (existingAttempt) {
    const nextAction = await getNextAction({ userId: req.user.id, courseId });
    return res.status(200).json({
      applied: false,
      attempt: existingAttempt,
      evaluation: {
        correct: existingAttempt.correct,
        score: existingAttempt.score,
        misconception: existingAttempt.misconception,
        misconceptionSeverity: existingAttempt.misconceptionSeverity,
      },
      nextAction,
    });
  }

  const evaluation = await evaluateFreeResponse({
    question: question.question,
    answer: req.body.answer,
    expectedAnswer: question.answer,
    context: question.explanation || "",
  });

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const dupe = await Attempt.findOne({ user: req.user.id, eventId }).session(session).lean();
      if (dupe) {
        result = { applied: false, attempt: dupe };
        return;
      }

      // Field is `course` on the Attempt schema (not `courseId`) — this
      // previously spread a `courseId` key into Attempt.create(), which
      // Mongoose's default strict mode silently drops as an unrecognized
      // field, leaving the required `course` field unset and failing
      // validation on every call to this route.
      const [created] = await Attempt.create([{
        user: req.user.id,
        eventId,
        course: courseId,
        conceptIds,
        questionId: question._id,
        question: question.question,
        answer: req.body.answer,
        correct: evaluation.correct,
        score: evaluation.score,
        confidence: req.body.confidence,
        difficulty,
        misconception: evaluation.misconception || null,
        misconceptionSeverity: evaluation.misconceptionSeverity || null,
      }], { session });

      let misconceptionRisk = 0;
      if (!evaluation.correct && evaluation.misconception) {
        const domain = normalizeDomain(course.subject);
        const perConceptRisks = [];
        for (const conceptId of conceptIds) {
          const assessment = await assessMisconceptionRisk({
            answer: req.body.answer,
            domain,
            userId: req.user.id,
            courseId,
            conceptId,
            llmMisconception: evaluation.misconception,
            llmSeverity: evaluation.misconceptionSeverity,
            session,
          });
          perConceptRisks.push(assessment.risk);

          const existingMisconception = await Misconception.findOne({
            user: req.user.id, course: courseId, concept: conceptId, resolved: false, misconceptionKey: assessment.misconceptionKey,
          }).session(session);
          if (existingMisconception) {
            existingMisconception.occurrences += 1;
            existingMisconception.description = assessment.description || existingMisconception.description;
            existingMisconception.severity = assessment.severity || existingMisconception.severity;
            existingMisconception.risk = assessment.risk;
            existingMisconception.lastDetectedAt = new Date();
            existingMisconception.evidence.push({ attemptId: created._id, text: req.body.answer });
            await existingMisconception.save({ session });
          } else {
            await Misconception.create([{
              user: req.user.id, course: courseId, concept: conceptId,
              description: assessment.description || evaluation.misconception,
              misconceptionKey: assessment.misconceptionKey,
              severity: assessment.severity || "medium",
              risk: assessment.risk,
              evidence: [{ attemptId: created._id, text: req.body.answer }],
            }], { session });
          }
        }
        // recordAttempt() below applies one shared risk value across every
        // concept this attempt touched (its signature predates per-concept
        // assessment) — use the strongest per-concept signal rather than an
        // average, since a high-risk misconception on any one of the touched
        // concepts should still influence this attempt's review scheduling.
        misconceptionRisk = perConceptRisks.length ? Math.max(...perConceptRisks) : 0;
      }

      const mastery = await recordAttempt({
        userId: req.user.id, courseId, conceptIds,
        score: evaluation.score, correct: evaluation.correct,
        confidence: req.body.confidence, difficulty,
        misconceptionRisk,
        session,
      });

      await LearningEvent.create([{
        eventId,
        user: req.user.id,
        course: courseId,
        attempt: created._id,
        type: "attempt",
        conceptIds,
        payload: {
          score: evaluation.score,
          correct: evaluation.correct,
          confidence: req.body.confidence,
          difficulty,
          misconception: evaluation.misconception || null,
          misconceptionSeverity: evaluation.misconceptionSeverity || null,
          misconceptionRisk,
          performanceBreakdown: mastery.performanceBreakdown,
          masteryBefore: mastery.masteryBefore,
          masteryAfter: Object.fromEntries(mastery.map((r) => [String(r.concept), r.mastery])),
        },
      }], { session });

      result = { applied: true, attempt: created, mastery };
    });
  } catch (err) {
    // See the matching comment on /tutor/respond: a duplicate-key error on
    // Attempt's unique (user, eventId) index means a concurrent identical
    // retry already committed first — fetch and return what it wrote
    // rather than surfacing this as a failure.
    if (err?.code === 11000) {
      const existing = await Attempt.findOne({ user: req.user.id, eventId }).lean();
      if (existing) {
        result = { applied: false, attempt: existing };
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  const nextAction = await getNextAction({ userId: req.user.id, courseId });
  res.status(result.applied ? 201 : 200).json({ ...result, evaluation, nextAction });
});

// NOTE: a plain `POST /attempts` route used to live here. It accepted
// `correct`/`score`/`misconception` directly from the client and fed them
// straight into mastery calculation and the misconception ledger — anyone
// could self-report a perfect score with no question ever being checked.
// It was unused by both the frontend and the rest of the backend, so it was
// removed rather than hardened. Use `/attempts/durable` (checks the answer
// against a real DiagnosticQuestion, idempotent) or `/attempts/evaluate`
// (LLM-graded free response) instead — both compute correctness server-side.

router.get("/courses/:courseId/misconceptions", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const items = await Misconception.find({ user: req.user.id, course: req.params.courseId, resolved: false }).populate("concept", "name").sort({ severity: -1, occurrences: -1 }).lean();
  res.json({ misconceptions: items });
});

// Persistent adaptive session: reads the authenticated learner model and
// returns only the next question, never its answer.
router.get("/courses/:courseId/study-session", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const result = await getNextStudyItem({ userId: req.user.id, courseId: req.params.courseId });
  if (!result) return res.status(404).json({ error: "Course not found." });
  res.json(result);
});

router.get("/courses/:courseId/adaptive-state", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const result = await getAdaptiveCourseState({ userId: req.user.id, courseId: req.params.courseId });
  if (!result) return res.status(404).json({ error: "Course not found." });
  res.json(result);
});

// Cross-course spaced-repetition queue: everything due for review right now,
// across every course the student owns, weakest first so a short session
// covers the most ground. Backed by the {user,nextReviewAt} index.
router.get("/review-queue", async (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const due = await StudentConcept.find({ user: req.user.id, nextReviewAt: { $lte: new Date() } })
    .populate("concept", "name importance difficulty course")
    .populate("course", "title examDate")
    .sort({ mastery: 1, nextReviewAt: 1 })
    .limit(limit)
    .lean();
  res.json({
    dueCount: due.length,
    items: due
      .filter((s) => s.concept && s.course)
      .map((s) => ({
        courseId: s.course._id,
        courseTitle: s.course.title,
        conceptId: s.concept._id,
        conceptName: s.concept.name,
        mastery: s.mastery,
        nextReviewAt: s.nextReviewAt,
        // Computed live, not read from the stored field — see the same
        // staleness note in nextAction.js. This endpoint's entire purpose
        // is surfacing what's actually been forgotten as time passes, so
        // serving a write-once-at-last-attempt snapshot here would
        // undermine the whole feature.
        forgettingRisk: calculateForgettingRisk(s.lastReviewedAt, s.mastery),
      })),
  });
});

// Deterministic time-boxed session plan (see services/studySession.js for why
// this isn't LLM-generated). `minutes` is student-supplied and clamped to a
// sane range; everything else is derived server-side from the student's own
// mastery/misconception/review data, same as getNextAction.
router.get("/courses/:courseId/study-session/plan", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const requested = Number(req.query.minutes);
  const minutes = Number.isFinite(requested) ? Math.min(120, Math.max(5, Math.round(requested))) : 20;
  const plan = await buildStudySessionPlan({ userId: req.user.id, courseId: req.params.courseId, minutes });
  if (!plan) return res.status(404).json({ error: "Course not found." });
  res.json({ plan });
});

// Fetches a question for one specific concept — used to drive each phase of
// a study-session plan, where (unlike /study-session) the concept is chosen
// by the plan rather than by the general next-action ranking. Mastery is
// looked up server-side (never taken from the client) so the cognitive-level
// selection in findQuestionForConcept can't be gamed into always serving the
// easiest question.
router.get("/courses/:courseId/concepts/:conceptId/question", async (req, res) => {
  const { courseId, conceptId } = req.params;
  if (!mongoose.isValidObjectId(courseId) || !mongoose.isValidObjectId(conceptId)) {
    return res.status(400).json({ error: "Invalid course or concept ID." });
  }
  const course = await Course.exists({ _id: courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const concept = await Concept.exists({ _id: conceptId, course: courseId });
  if (!concept) return res.status(404).json({ error: "Concept not found in this course." });
  const state = await StudentConcept.findOne({ user: req.user.id, course: courseId, concept: conceptId }).select("mastery").lean();
  const question = await findQuestionForConcept({ courseId, conceptId, mastery: state?.mastery ?? 0 });
  res.json({ question });
});

// Canonical idempotent attempt ingestion. The event ID is supplied by the
// client as an idempotency key, but all learner state is derived server-side.
router.post("/attempts/durable", validate(durableAttemptSchema), async (req, res) => {
  const course = await Course.exists({ _id: req.body.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const eventId = req.body.eventId || req.get("Idempotency-Key");
  if (!eventId) return res.status(400).json({ error: "An Idempotency-Key or eventId is required." });

  if (req.body.diagnosticSessionId) {
    const activeSession = await DiagnosticSession.exists({
      _id: req.body.diagnosticSessionId, user: req.user.id, course: req.body.courseId, status: "active",
    });
    if (!activeSession) return res.status(404).json({ error: "Diagnostic session not found or already completed." });
  }

  const evaluated = await evaluateQuestionAnswer({
    questionId: req.body.questionId,
    answer: req.body.answer,
  });
  if (String(evaluated.question.course) !== String(req.body.courseId)) {
    return res.status(400).json({ error: "That question does not belong to this course." });
  }

  const result = await recordDurableAttempt({
    userId: req.user.id,
    courseId: req.body.courseId,
    eventId,
    conceptIds: evaluated.question.conceptIds,
    questionId: req.body.questionId,
    question: evaluated.question.question,
    answer: req.body.answer,
    correct: evaluated.correct,
    score: evaluated.score,
    confidence: req.body.confidence,
    difficulty: evaluated.question.difficulty ?? 3,
    responseTimeMs: req.body.responseTimeMs,
    hintUsed: req.body.hintUsed ?? false,
    misconception: evaluated.misconception,
    misconceptionSeverity: evaluated.misconceptionSeverity,
    diagnosticSessionId: req.body.diagnosticSessionId || null,
  });

  const nextAction = await getNextAction({ userId: req.user.id, courseId: req.body.courseId });
  res.status(result.applied ? 201 : 200).json({ ...result, evaluation: { correct: evaluated.correct, score: evaluated.score, misconception: evaluated.misconception, misconceptionSeverity: evaluated.misconceptionSeverity }, nextAction });
});

// Merges exact-name-duplicate concepts within the caller's own course (see
// conceptDedup.js) — a self-service maintenance action scoped to a course
// the requester owns, not an admin-only operation.
router.post("/courses/:courseId/dedup", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const result = await deduplicateConceptsInCourse(req.params.courseId);
  res.json(result);
});

// Admin-only: (re-)seed the shared misconception-pattern library. Patterns
// are matched against student free-response answers via regex, so this is
// deliberately restricted to admins rather than any authenticated user —
// same reasoning as every other admin-only route in this app.
router.post("/admin/seed-patterns", requireRole("admin"), async (req, res) => {
  await seedMisconceptionPatterns();
  res.json({ ok: true });
});

// Active misconception patterns for a domain — shared reference data, not
// per-user, so no ownership scoping is needed to read it.
router.get("/patterns/:domain", async (req, res) => {
  const patterns = await MisconceptionPattern.find({ domain: req.params.domain, active: true }).lean();
  res.json({ patterns });
});

router.get("/courses/:courseId/streak", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const streak = await getStreak(req.user.id, req.params.courseId);
  res.json({ streak: streak || { currentStreak: 0, longestStreak: 0, studyDaysThisWeek: 0 } });
});

router.get("/tutor/:conceptId", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.conceptId)) return res.status(400).json({ error: "Invalid concept ID." });
  const concept = await Concept.findById(req.params.conceptId).lean();
  if (!concept) return res.status(404).json({ error: "Concept not found." });
  try {
    const response = await generateStructuredTutorResponse({
      concept: concept.name,
      misconceptionDetected: req.query.misconception || null,
    });
    res.json(response);
  } catch {
    res.status(500).json({ error: "Failed to generate tutor response." });
  }
});

router.get("/courses/:courseId/readiness", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.courseId)) return res.status(400).json({ error: "Invalid course ID." });
  const course = await Course.exists({ _id: req.params.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });
  try {
    const readiness = await calculateExamReadiness(req.user.id, req.params.courseId);
    res.json({ readiness });
  } catch {
    res.status(500).json({ error: "Failed to calculate readiness." });
  }
});

export default router;
