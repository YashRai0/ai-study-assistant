import { Router } from "express";
import { z } from "zod";
import { generateStudyPlan } from "../services/llm.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { validate } from "../middleware/validate.js";
import { studyPlanRequestSchema, studyPlanResultSchema } from "../validation/schemas.js";
import { extractAndValidateJson } from "../utils/parseJson.js";
import Pdf from "../models/Pdf.js";
import QuizAttempt from "../models/QuizAttempt.js";
import StudyPlan from "../models/StudyPlan.js";
import logger from "../utils/logger.js";

const router = Router();
router.use(requireAuth);

const ALL_SCOPE = "All subjects";
const DEFAULT_DAYS = 7;

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetweenInclusive(today, examDate) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((examDate - today) / msPerDay);
  return diff + 1; // inclusive of both today and the exam date
}

router.post("/", aiLimiter, validate(studyPlanRequestSchema), async (req, res) => {
  const { subject, examDate: examDateStr, days: requestedDays, minutesPerDay } = req.body;
  const scope = subject || ALL_SCOPE;

  const filter = { owner: req.user.id };
  if (scope !== ALL_SCOPE) filter.subject = scope;

  try {
    const pdfs = await Pdf.find(filter).select("filename subject fullText");
    if (pdfs.length === 0) {
      return res.status(400).json({
        error:
          scope === ALL_SCOPE
            ? "You haven't uploaded any notes yet — upload a PDF first."
            : `You haven't uploaded any notes under "${scope}" yet.`,
      });
    }

    // Validate the exam date ourselves (kept as a plain string in the zod
    // schema — see schemas.js) rather than relying on a date-format
    // validator there, and compute how many days that gives us to plan for.
    let examDate = null;
    let days = requestedDays || DEFAULT_DAYS;
    if (examDateStr) {
      const parsed = new Date(examDateStr);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "That doesn't look like a valid date." });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      parsed.setHours(0, 0, 0, 0);
      if (parsed < today) {
        return res.status(400).json({ error: "The exam date needs to be today or in the future." });
      }
      examDate = parsed;
      days = Math.min(daysBetweenInclusive(today, parsed), 60); // same cap as the request schema's `days` field
    }

    // Identify subjects the student has scored lower on in past quizzes, so
    // the plan can prioritize them — same subject scope as the plan itself.
    const quizFilter = { owner: req.user.id };
    if (scope !== ALL_SCOPE) quizFilter.subject = scope;
    const quizBySubject = await QuizAttempt.aggregate([
      { $match: quizFilter },
      { $group: { _id: "$subject", totalScore: { $sum: "$score" }, totalPossible: { $sum: "$total" } } },
    ]);
    const WEAK_THRESHOLD_PERCENT = 70;
    const weakSubjects = quizBySubject
      .filter((s) => s.totalPossible > 0 && (s.totalScore / s.totalPossible) * 100 < WEAK_THRESHOLD_PERCENT)
      .map((s) => s._id);

    const raw = await generateStudyPlan(
      pdfs.map((p) => ({ filename: p.filename, subject: p.subject, fullText: p.fullText })),
      {
        examDate: examDate ? toDateOnly(examDate) : undefined,
        days,
        minutesPerDay,
        weakSubjects,
      }
    );

    const parsed = extractAndValidateJson(raw, studyPlanResultSchema, { arrayBracket: false });
    if (!parsed.success) {
      logger.error({ reqId: req.id, reason: parsed.reason, sample: raw.slice(0, 500) }, "Study plan JSON validation failed");
      return res.status(502).json({ error: "The AI returned a study plan in an unexpected format. Please try again." });
    }

    // Attach a real calendar date to each day if an exam date was given, so
    // the frontend can show "Tue, Aug 4" instead of just "Day 3".
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysWithDates = parsed.data.days.map((d) => ({
      ...d,
      date: examDate
        ? toDateOnly(new Date(today.getTime() + (d.day - 1) * 24 * 60 * 60 * 1000))
        : undefined,
      completed: false,
    }));

    const plan = await StudyPlan.create({
      owner: req.user.id,
      planTitle: parsed.data.planTitle,
      scope,
      examDate: examDate ? toDateOnly(examDate) : undefined,
      days: daysWithDates,
    });

    res.status(201).json({ plan });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Study plan generation error");
    res.status(500).json({ error: "Couldn't generate a study plan right now. Please try again." });
  }
});

router.get("/", async (req, res) => {
  const plans = await StudyPlan.find({ owner: req.user.id })
    .sort({ createdAt: -1 })
    .select("planTitle scope examDate createdAt days");
  res.json({
    plans: plans.map((p) => ({
      id: p._id,
      planTitle: p.planTitle,
      scope: p.scope,
      examDate: p.examDate,
      createdAt: p.createdAt,
      totalDays: p.days.length,
      completedDays: p.days.filter((d) => d.completed).length,
    })),
  });
});

router.get("/:planId", async (req, res) => {
  const plan = await StudyPlan.findOne({ _id: req.params.planId, owner: req.user.id });
  if (!plan) return res.status(404).json({ error: "Study plan not found." });
  res.json({ plan });
});

const toggleDaySchema = z.object({ completed: z.boolean() });

router.patch("/:planId/days/:dayIndex", validate(toggleDaySchema), async (req, res) => {
  const { planId, dayIndex } = req.params;
  const idx = parseInt(dayIndex, 10);

  const plan = await StudyPlan.findOne({ _id: planId, owner: req.user.id });
  if (!plan) return res.status(404).json({ error: "Study plan not found." });
  if (!Number.isInteger(idx) || idx < 0 || idx >= plan.days.length) {
    return res.status(400).json({ error: "Invalid day index." });
  }

  plan.days[idx].completed = req.body.completed;
  await plan.save();
  res.json({ ok: true });
});

router.delete("/:planId", async (req, res) => {
  const result = await StudyPlan.deleteOne({ _id: req.params.planId, owner: req.user.id });
  if (result.deletedCount === 0) return res.status(404).json({ error: "Study plan not found." });
  res.json({ ok: true });
});

export default router;
