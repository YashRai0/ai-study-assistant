import StudentConcept from "../models/StudentConcept.js";
import Course from "../models/Course.js";
import Concept from "../models/Concept.js";
import { calculateRetention } from "./masteryWithEbbinghaus.js";

// Calculate projected mastery on exam date
function projectMastery(currentMastery, lastReviewedAt, examDate) {
  if (!lastReviewedAt || !examDate) return currentMastery;

  const now = new Date();
  const examTime = new Date(examDate).getTime();
  const daysUntilExam = (examTime - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExam < 0) return 0; // Exam already passed

  // Project: retention will decline over time without review
  // But if daysUntilExam is short, mastery stays stable
  const projectedMastery = calculateRetention(currentMastery, Math.max(0, daysUntilExam - 7));
  return Math.max(0, Math.min(1, projectedMastery));
}

export async function calculateExamReadiness(userId, courseId) {
  const course = await Course.findById(courseId).lean();
  if (!course) return null;

  const concepts = await Concept.find({ course: courseId }).select("_id").lean();
  const conceptIds = concepts.map((c) => c._id);

  if (!conceptIds.length) {
    return {
      readyPercent: 0,
      readinessEstimate: 0,
      conceptsReady: 0,
      conceptsTotal: 0,
      conceptsAttempted: 0,
      coveragePercent: 0,
      daysUntilExam: null,
      message: "No concepts have been extracted yet.",
    };
  }

  const studentConcepts = await StudentConcept.find({
    user: userId,
    course: courseId,
    concept: { $in: conceptIds },
  }).lean();
  const byConcept = new Map(studentConcepts.map((sc) => [String(sc.concept), sc]));

  // Every course concept participates in the readiness average, not just
  // the ones the student has actually attempted — a student who's only
  // touched 2 of 20 concepts (even at 90% mastery on those 2) is not 90%
  // ready for an exam covering all 20. A concept with no StudentConcept
  // record at all counts as 0 mastery/0 projected, same principle as
  // computePrerequisiteReadiness in nextAction.js: absence of data isn't
  // evidence the student knows it.
  const projections = concepts.map((concept) => {
    const sc = byConcept.get(String(concept._id));
    if (!sc) return { conceptId: String(concept._id), projected: 0, current: 0, attempted: false };
    const projected = projectMastery(sc.mastery || 0, sc.lastReviewedAt, course.examDate);
    return { conceptId: String(concept._id), projected, current: sc.mastery || 0, attempted: true };
  });

  const avgProjected = projections.reduce((sum, p) => sum + p.projected, 0) / projections.length;
  const conceptsReady = projections.filter((p) => p.projected >= 0.7).length;
  const attemptedConcepts = projections.filter((p) => p.attempted).length;
  const coveragePercent = Math.round((attemptedConcepts / projections.length) * 100);

  const readinessEstimate = Math.round(avgProjected * 100);
  const readyPercent = readinessEstimate; // kept alongside readinessEstimate for existing callers/UI
  const daysUntilExam = course.examDate
    ? Math.ceil((new Date(course.examDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Readiness alone can look deceptively high from a couple of
  // well-studied concepts — require real coverage too before declaring
  // "ready", not just a good average over a small attempted subset.
  let message = "";
  if (readinessEstimate >= 80 && coveragePercent >= 90) {
    message = `✓ You're ready! ${readinessEstimate}% readiness across ${coveragePercent}% of concepts. Keep up the reviews.`;
  } else if (readinessEstimate >= 60) {
    const weak = projections.filter((p) => p.projected < 0.5).length;
    message = `${readinessEstimate}% readiness across ${coveragePercent}% of concepts. ${weak} concepts need attention.`;
  } else {
    message = `${readinessEstimate}% readiness across ${coveragePercent}% of concepts.${daysUntilExam != null ? ` ${daysUntilExam} days left—accelerate your pace.` : ""}`;
  }

  return {
    readyPercent,
    // This is a product readiness estimate, not a calibrated probability of
    // passing — the old `passProb` field name and its logistic formula
    // (arbitrary steepness=5/threshold=3 constants, no historical exam
    // outcome data behind them) implied a statistical guarantee this
    // system has no basis to make. Same value, honest name.
    readinessEstimate,
    conceptsReady,
    conceptsTotal: concepts.length,
    conceptsAttempted: attemptedConcepts,
    coveragePercent,
    daysUntilExam,
    message,
  };
}
