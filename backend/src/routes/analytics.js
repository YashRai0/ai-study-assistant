import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import Pdf from "../models/Pdf.js";
import ChatMessage from "../models/ChatMessage.js";
import MultiChatMessage from "../models/MultiChatMessage.js";
import QuizAttempt from "../models/QuizAttempt.js";
import logger from "../utils/logger.js";

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

export default router;
