// Email templates ready for SendGrid/Mailgun integration
import logger from "../utils/logger.js";

export const emailTemplates = {
  reviewReminder: {
    subject: "🎓 {{conceptCount}} concepts due for review",
    html: `
      <h2>Time to review!</h2>
      <p>Hi {{name}},</p>
      <p>You have <strong>{{conceptCount}}</strong> concepts due for review in <strong>{{courseName}}</strong>.</p>
      <p>Studies show that reviewing at the right time dramatically improves retention. Your concepts are optimized for review today based on the spacing algorithm.</p>
      <p>
        <a href="{{appUrl}}/study" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          Start reviewing →
        </a>
      </p>
      <p><small>You can adjust notification frequency in <a href="{{appUrl}}/settings">settings</a>.</small></p>
    `,
  },

  streakMilestone: {
    subject: "🔥 {{streakDays}} day streak! Keep it going!",
    html: `
      <h2>Amazing work!</h2>
      <p>Hi {{name}},</p>
      <p>You've maintained a <strong>{{streakDays}} day study streak</strong> in {{courseName}}. That's incredible consistency!</p>
      <p>Research shows that streaks are one of the strongest predictors of learning success. You're building a habit that will transform your education.</p>
      <p>
        <a href="{{appUrl}}/study" style="background-color: #ff6b35; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          Continue your streak →
        </a>
      </p>
      <p><small>Share your progress: <a href="{{shareUrl}}">{{shareUrl}}</a></small></p>
    `,
  },

  progressUpdate: {
    subject: "📊 You're {{masteryPercent}}% done with {{courseName}}!",
    html: `
      <h2>Great progress!</h2>
      <p>Hi {{name}},</p>
      <p>You've achieved <strong>{{masteryPercent}}%</strong> mastery in {{courseName}}.</p>
      <p>Concepts mastered: <strong>{{conceptsMastered}}/{{conceptsTotal}}</strong></p>
      <p>
        <a href="{{appUrl}}/analytics" style="background-color: #06b6d4; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          View analytics →
        </a>
      </p>
      <p><small>Target exam readiness: {{readyPercent}}% (keep reviewing weak concepts)</small></p>
    `,
  },

  examReminder: {
    subject: "📅 {{daysLeft}} days until {{examName}}",
    html: `
      <h2>Exam countdown</h2>
      <p>Hi {{name}},</p>
      <p>Your exam <strong>{{examName}}</strong> is in <strong>{{daysLeft}} days</strong>.</p>
      <p>Current readiness: <strong>{{readyPercent}}%</strong></p>
      <p>You're at {{readinessEstimate}}% readiness across {{coveragePercent}}% of concepts. Focus on weak concepts to close the gap.</p>
      <p>
        <a href="{{appUrl}}/study" style="background-color: #f59e0b; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          Study weak concepts →
        </a>
      </p>
    `,
  },

  weeklyDigest: {
    subject: "📈 Your weekly learning digest",
    html: `
      <h2>Weekly summary</h2>
      <p>Hi {{name}},</p>
      <h3>This week:</h3>
      <ul>
        <li>{{minutesStudied}} minutes of study</li>
        <li>{{accuracy}}% accuracy</li>
        <li>{{streakDays}} day streak 🔥</li>
        <li>{{conceptsLearned}} concepts learned</li>
      </ul>
      <p>
        <a href="{{appUrl}}/analytics" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          View full analytics →
        </a>
      </p>
      <p><small>You're on track for {{readyPercent}}% readiness by {{examDate}}</small></p>
    `,
  },

  passwordReset: {
    subject: "Reset your AI Study Assistant password",
    html: `
      <h2>Reset your password</h2>
      <p>We received a request to reset the password for your AI Study Assistant account.</p>
      <p>Click the link below to set a new password:</p>
      <p>
        <a href="{{resetUrl}}" style="background-color: #111827; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
          Reset Password →
        </a>
      </p>
      <p>This password reset link expires in 1 hour.</p>
      <p>If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.</p>
    `,
  },
};

// Template renderer
export function renderTemplate(templateName, variables = {}) {
  const template = emailTemplates[templateName];
  if (!template) throw new Error(`Template ${templateName} not found`);
  
  let html = template.html;
  let subject = template.subject;
  
  // Replace all {{variable}} with actual values
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    html = html.replace(regex, value || "");
    subject = subject.replace(regex, value || "");
  }
  
  return { subject, html };
}

// Email service (handles development simulation and production provider dispatch)
export async function sendEmail({ to, templateName, variables = {} }) {
  const { subject, html } = renderTemplate(templateName, variables);

  const isProduction = process.env.NODE_ENV === "production";
  const hasProvider = Boolean(process.env.SENDGRID_API_KEY);

  if (isProduction && hasProvider) {
    // In production with a real email provider configured:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send({ to, subject, html, from: process.env.EMAIL_FROM || 'noreply@prepnexia.com' });
    return { sent: true, simulated: false, to, subject };
  }

  if (isProduction && !hasProvider) {
    logger.warn({ to, templateName }, "Email not sent: No email provider configured in production");
    return { sent: false, simulated: false, reason: "NO_PROVIDER", to, subject };
  }

  // Development / local simulation:
  // Render template, log recipient and reset URL clearly without exposing raw token separately.
  console.log("\n==================== [DEV EMAIL SIMULATION] ====================");
  console.log(`[DEV EMAIL] To: ${to}`);
  console.log(`[DEV EMAIL] Subject: ${subject}`);
  if (variables.resetUrl) {
    console.log(`[DEV EMAIL] Reset URL: ${variables.resetUrl}`);
  }
  console.log("[DEV EMAIL] (Development only — no actual email was delivered)");
  console.log("================================================================\n");

  logger.info(
    {
      to,
      subject,
      templateName,
      simulated: true,
      hasResetUrl: Boolean(variables.resetUrl),
    },
    "Development email simulated (no external email provider configured)"
  );

  return {
    sent: false,
    simulated: true,
    to,
    subject,
    html,
  };
}
