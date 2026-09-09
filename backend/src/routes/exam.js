import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import Course from "../models/Course.js";
import { startExam, getNextExamQuestion, recordExamAnswer, getExamReport } from "../services/examSimulator.js";

const router = Router();
router.use(requireAuth);

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), { message: "Invalid ID" });

const startSchema = z.object({
  courseId: objectId,
  totalQuestions: z.number().int().min(5).max(60).optional(),
});

router.post("/start", validate(startSchema), async (req, res) => {
  const course = await Course.exists({ _id: req.body.courseId, owner: req.user.id });
  if (!course) return res.status(404).json({ error: "Course not found." });

  const result = await startExam({
    userId: req.user.id,
    courseId: req.body.courseId,
    totalQuestions: req.body.totalQuestions || 20,
  });
  if (!result) return res.status(404).json({ error: "Course not found." });
  if (result.error === "NO_CONCEPTS") return res.status(400).json({ error: "This course doesn't have any concepts yet — upload notes first." });
  if (result.error === "NO_QUESTIONS") return res.status(400).json({ error: "This course doesn't have any exam questions yet." });

  res.status(201).json({ examId: result._id, totalQuestions: result.conceptQueue.length });
});

router.get("/:examId/next", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.examId)) return res.status(400).json({ error: "Invalid exam ID." });
  const result = await getNextExamQuestion({ userId: req.user.id, examId: req.params.examId });
  if (!result) return res.status(404).json({ error: "Exam not found." });
  res.json(result);
});

const answerSchema = z.object({
  questionId: objectId,
  answer: z.string().max(20000),
  confidence: z.number().int().min(1).max(5),
  responseTimeMs: z.number().int().min(0).optional().nullable(),
});

router.post("/:examId/answer", validate(answerSchema), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.examId)) return res.status(400).json({ error: "Invalid exam ID." });
  try {
    const result = await recordExamAnswer({
      userId: req.user.id,
      examId: req.params.examId,
      questionId: req.body.questionId,
      answer: req.body.answer,
      confidence: req.body.confidence,
      responseTimeMs: req.body.responseTimeMs,
    });
    if (!result) return res.status(404).json({ error: "Exam not found." });
    res.json({ ...result.evaluated, examStatus: result.exam.status });
  } catch (err) {
    res.status(400).json({ error: err.message || "Couldn't record that answer." });
  }
});

router.get("/:examId/report", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.examId)) return res.status(400).json({ error: "Invalid exam ID." });
  const report = await getExamReport({ userId: req.user.id, examId: req.params.examId });
  if (!report) return res.status(404).json({ error: "Exam not found." });
  res.json({ report });
});

export default router;
