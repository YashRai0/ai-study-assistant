import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { generalLimiter } from "../middleware/rateLimit.js";
import Pdf from "../models/Pdf.js";
import Concept from "../models/Concept.js";
import ChatMessage from "../models/ChatMessage.js";
import MultiChatMessage from "../models/MultiChatMessage.js";
import QuizAttempt from "../models/QuizAttempt.js";
import LearningEvent from "../models/LearningEvent.js";
import InterventionOutcome from "../models/InterventionOutcome.js";
import logger from "../utils/logger.js";
import { trackEvent, getUserFunnel, getFeatureAdoption, getUsageTrends } from "../services/analyticsService.js";
import { summarizeStrategyEffectiveness } from "../services/strategyEffectiveness.js";

const router = Router();
router.use(requireAuth);

const ACTIVITY_WINDOW_DAYS = 30;

async function countsByDay(Model, ownerId, dateField, matchExtra = {}) {
  const since = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return Model.aggregate([
    { $match: { owner: ownerId, [dateField]: { $gte: since }, ...matchExtra } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } }, count: { $sum: 1 } } },
  ]);
}

router.get("/summary", async (req, res) => {
  const ownerId = new mongoose.Types.ObjectId(req.user.id);

  try {
    const [
      totalPdfs,
      pdfsBySubjectRaw,
      chatQuestionCount,
      multiChatQuestionCount,
      quizTotalsRaw,
      quizBySubjectRaw,
      recentAttempts,
      chatDays,
      multiChatDays,
      quizDays,
    ] = await Promise.all([
      Pdf.countDocuments({ owner: ownerId }),
      Pdf.aggregate([{ $match: { owner: ownerId } }, { $group: { _id: "$subject", count: { $sum: 1 } } }]),
      ChatMessage.countDocuments({ owner: ownerId, role: "user" }),
      MultiChatMessage.countDocuments({ owner: ownerId, role: "user" }),
      QuizAttempt.aggregate([
        { $match: { owner: ownerId } },
        { $group: { _id: null, attempts: { $sum: 1 }, totalScore: { $sum: "$score" }, totalPossible: { $sum: "$total" } } },
      ]),
      QuizAttempt.aggregate([
        { $match: { owner: ownerId } },
        {
          $group: {
            _id: "$subject",
            attempts: { $sum: 1 },
            totalScore: { $sum: "$score" },
            totalPossible: { $sum: "$total" },
          },
        },
      ]),
      QuizAttempt.find({ owner: ownerId }).sort({ takenAt: -1 }).limit(10).select("subject filename score total takenAt"),
      countsByDay(ChatMessage, ownerId, "ts", { role: "user" }),
      countsByDay(MultiChatMessage, ownerId, "ts", { role: "user" }),
      countsByDay(QuizAttempt, ownerId, "takenAt"),
    ]);

    // Merge the three activity sources into one day -> count map, then build
    // a continuous ACTIVITY_WINDOW_DAYS-day array (0-filled for quiet days)
    // so the frontend chart has a fixed x-axis rather than gaps.
    const dayMap = new Map();
    for (const rows of [chatDays, multiChatDays, quizDays]) {
      for (const { _id, count } of rows) {
        dayMap.set(_id, (dayMap.get(_id) || 0) + count);
      }
    }
    const activityByDay = [];
    for (let i = ACTIVITY_WINDOW_DAYS - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      activityByDay.push({ date: key, count: dayMap.get(key) || 0 });
    }

    // Study streak: consecutive active days ending today, walking backward.
    // If today has no activity yet, that alone doesn't break a streak that's
    // still ongoing from yesterday — today just isn't over. This is capped
    // at ACTIVITY_WINDOW_DAYS by construction (the array itself only covers
    // that window), so a streak longer than 30 days will under-report.
    let streak = 0;
    let i = activityByDay.length - 1;
    if (activityByDay[i].count === 0) i--;
    for (; i >= 0; i--) {
      if (activityByDay[i].count > 0) streak++;
      else break;
    }

    const quizTotals = quizTotalsRaw[0] || { attempts: 0, totalScore: 0, totalPossible: 0 };
    const averageScorePercent =
      quizTotals.totalPossible > 0 ? Math.round((quizTotals.totalScore / quizTotals.totalPossible) * 100) : null;

    const quizBySubject = quizBySubjectRaw.map((s) => ({
      subject: s._id,
      attempts: s.attempts,
      averageScorePercent: s.totalPossible > 0 ? Math.round((s.totalScore / s.totalPossible) * 100) : null,
    }));

    res.json({
      totalPdfs,
      pdfsBySubject: pdfsBySubjectRaw.map((s) => ({ subject: s._id, count: s.count })),
      totalQuestionsAsked: chatQuestionCount + multiChatQuestionCount,
      quiz: {
        attempts: quizTotals.attempts,
        averageScorePercent,
        bySubject: quizBySubject,
        recent: recentAttempts.map((a) => ({
          subject: a.subject,
          filename: a.filename,
          score: a.score,
          total: a.total,
          takenAt: a.takenAt,
        })),
      },
      activityByDay,
      studyStreakDays: streak,
    });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Analytics summary error");
    res.status(500).json({ error: "Couldn't load your analytics right now. Please try again." });
  }
});

// Mastery over time for a course (optionally scoped to one concept).
// Backed by LearningEvent.payload.masteryAfter, which adaptiveRuntime.js
// already records on every /attempts/durable and /attempts/evaluate call
// specifically for later instrumentation/validation of the mastery model
// (see mastery.js) — this just surfaces that ledger as a time series
// instead of adding a new field or a separate history collection.
router.get("/mastery-trend", async (req, res) => {
  const { courseId, conceptId } = req.query;
  if (!courseId || !mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ error: "A valid courseId is required." });
  }
  if (conceptId && !mongoose.isValidObjectId(conceptId)) {
    return res.status(400).json({ error: "Invalid conceptId." });
  }

  try {
    const events = await LearningEvent.find({
      user: new mongoose.Types.ObjectId(req.user.id),
      course: new mongoose.Types.ObjectId(courseId),
      type: "attempt",
      "payload.masteryAfter": { $exists: true },
    })
      .sort({ createdAt: 1 })
      .select("createdAt payload.masteryAfter")
      .lean();

    const points = events
      .map((e) => {
        const masteryAfter = e.payload?.masteryAfter || {};
        let mastery;
        if (conceptId) {
          if (!(conceptId in masteryAfter)) return null;
          mastery = masteryAfter[conceptId];
        } else {
          // No concept filter: average across every concept this attempt
          // touched, so a multi-concept attempt still contributes one
          // point rather than skewing the trend toward whichever concept
          // happens to appear in the most attempts.
          const values = Object.values(masteryAfter);
          if (!values.length) return null;
          mastery = values.reduce((sum, v) => sum + v, 0) / values.length;
        }
        return { date: e.createdAt, mastery: Math.round(mastery * 1000) / 1000 };
      })
      .filter(Boolean);

    res.json({ courseId, conceptId: conceptId || null, points });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Mastery trend error");
    res.status(500).json({ error: "Couldn't load the mastery trend right now." });
  }
});

// Which tutoring strategy actually works for this student, not just
// which the engine tries most — see InterventionOutcome's `strategy`
// field and services/strategyEffectiveness.js for what "works" means
// here (ranked by mastery delta, not raw success-outcome rate).
router.get("/strategy-effectiveness", async (req, res) => {
  const { courseId } = req.query;
  if (!courseId || !mongoose.isValidObjectId(courseId)) {
    return res.status(400).json({ error: "A valid courseId is required." });
  }

  try {
    const concepts = await Concept.find({ course: courseId }).select("_id").lean();
    const conceptIds = concepts.map((c) => c._id);
    const outcomes = await InterventionOutcome.find({
      user: new mongoose.Types.ObjectId(req.user.id),
      concept: { $in: conceptIds },
    })
      .select("strategy outcome masteryDelta")
      .lean();

    res.json({ courseId, strategies: summarizeStrategyEffectiveness(outcomes) });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Strategy effectiveness error");
    res.status(500).json({ error: "Couldn't load strategy effectiveness right now." });
  }
});

// Track a lightweight product-usage event (login, quiz_completed, etc.)
router.post("/track", generalLimiter, async (req, res) => {
  const { eventType, metadata } = req.body;
  if (!eventType) {
    return res.status(400).json({ error: "eventType required" });
  }

  try {
    await trackEvent(req.user.id, eventType, metadata);
    res.json({ success: true });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Event tracking error");
    res.status(500).json({ error: "Couldn't record that event." });
  }
});

// Get the current user's own funnel (signup -> first study -> quiz -> focus mode)
router.get("/funnel", async (req, res) => {
  try {
    const funnel = await getUserFunnel(req.user.id);
    res.json(funnel);
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Funnel error");
    res.status(500).json({ error: "Couldn't load your funnel right now." });
  }
});

// Admin-only: feature adoption across all users
router.get("/admin/adoption", requireRole("admin"), async (req, res) => {
  try {
    const adoption = await getFeatureAdoption();
    res.json(adoption);
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Adoption metrics error");
    res.status(500).json({ error: "Couldn't load adoption metrics." });
  }
});

// Admin-only: usage trend for one event type over N days
router.get("/admin/trends/:eventType", requireRole("admin"), async (req, res) => {
  const { eventType } = req.params;
  const days = Math.min(parseInt(req.query.days) || 30, 365);

  try {
    const trends = await getUsageTrends(eventType, days);
    res.json({ eventType, data: trends });
  } catch (err) {
    logger.error({ reqId: req.id, err }, "Usage trends error");
    res.status(500).json({ error: "Couldn't load usage trends." });
  }
});

export default router;
