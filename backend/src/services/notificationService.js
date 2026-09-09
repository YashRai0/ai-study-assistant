// Simple email notification stubs (in production, use SendGrid, Twilio, etc.)

export async function sendReviewReminder({ userEmail, dueCount, courseTitle }) {
  console.log(`[Email] ${userEmail}: You have ${dueCount} concepts due for review in ${courseTitle}`);
  // In production:
  // const mailgun = require('mailgun.js');
  // await mailgun.messages().send({ to: userEmail, ... })
}

export async function sendStreakNotification({ userEmail, streakDays, courseTitle }) {
  console.log(`[Email] ${userEmail}: ${streakDays} day streak in ${courseTitle}! 🔥`);
}

export async function sendProgressUpdate({ userEmail, masteryPercent, courseTitle }) {
  console.log(`[Email] ${userEmail}: You're ${masteryPercent}% done with ${courseTitle}!`);
}

export async function scheduleNotifications() {
  // In production, run this daily at 4pm:
  // const users = await User.find({ notificationsEnabled: true });
  // for (const user of users) {
  //   const dueReviews = await StudentConcept.countDocuments({ user: user._id, nextReviewAt: { $lte: new Date() } });
  //   if (dueReviews > 0) {
  //     await sendReviewReminder({ userEmail: user.email, dueCount: dueReviews, courseTitle: "Your courses" });
  //   }
  // }
}
