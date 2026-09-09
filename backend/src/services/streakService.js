import UserStreak from "../models/UserStreak.js";

export async function updateStreak(userId, courseId) {
  const streak = await UserStreak.findOne({ user: userId, course: courseId });
  const today = new Date().toDateString();
  const lastDate = streak?.lastActivityDate ? new Date(streak.lastActivityDate).toDateString() : null;

  if (lastDate === today) {
    // Already studied today, no change
    return streak;
  }

  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let currentStreak = 1;
  let longestStreak = 1;

  if (lastDate === yesterday) {
    // Continued the streak
    currentStreak = (streak?.currentStreak || 0) + 1;
    longestStreak = Math.max(currentStreak, streak?.longestStreak || 0);
  } else {
    // Streak broken or starting new
    currentStreak = 1;
    longestStreak = streak?.longestStreak || 1;
  }

  const studyDaysThisWeek = (streak?.studyDaysThisWeek || 0) + 1;

  return UserStreak.findOneAndUpdate(
    { user: userId, course: courseId },
    {
      currentStreak,
      longestStreak,
      lastActivityDate: new Date(),
      studyDaysThisWeek: Math.min(7, studyDaysThisWeek),
    },
    { upsert: true, new: true }
  );
}

export async function getStreak(userId, courseId) {
  return UserStreak.findOne({ user: userId, course: courseId });
}

export async function resetWeeklyStreak() {
  const now = new Date();
  const lastMonday = new Date(now.setDate(now.getDate() - now.getDay() + 1));
  await UserStreak.updateMany(
    { updatedAt: { $lt: lastMonday } },
    { studyDaysThisWeek: 0 }
  );
}
