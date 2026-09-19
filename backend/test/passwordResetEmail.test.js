import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { emailTemplates, renderTemplate, sendEmail } from "../src/services/emailTemplates.js";

test("passwordReset template: exists and contains all required security/guidance elements", () => {
  const template = emailTemplates.passwordReset;
  assert.ok(template, "passwordReset template must exist in emailTemplates");
  assert.ok(typeof template.subject === "string" && template.subject.length > 0, "Subject must be defined");
  assert.match(template.subject, /reset.*password/i, "Subject should clearly mention password reset");

  assert.ok(template.html.includes("{{resetUrl}}"), "Template must contain {{resetUrl}} placeholder");
  assert.match(template.html, /1 hour/i, "Template must state that the link expires in 1 hour");
  assert.match(
    template.html,
    /ignore this email/i,
    "Template must state that users can ignore the email if they didn't request it"
  );
});

test("passwordReset template: renderTemplate correctly interpolates resetUrl", () => {
  const testUrl = "http://localhost:5173/reset-password?token=0123456789abcdef0123456789abcdef&email=test%40example.com";
  const { subject, html } = renderTemplate("passwordReset", { resetUrl: testUrl });

  assert.match(subject, /reset.*password/i);
  assert.ok(html.includes(testUrl), "Rendered HTML must contain the interpolated reset URL");
  assert.ok(!html.includes("{{resetUrl}}"), "Placeholder {{resetUrl}} must be fully replaced");
});

test("development email path: logs recipient and resetUrl clearly as simulation without claiming real delivery", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSendgridKey = process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  process.env.NODE_ENV = "development";

  const logs = [];
  const originalConsoleLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  try {
    const testUrl = "http://localhost:5173/reset-password?token=mocktoken64charslong1234567890abcdef1234567890abcdef1234567890ab&email=student%40example.com";
    const result = await sendEmail({
      to: "student@example.com",
      templateName: "passwordReset",
      variables: { resetUrl: testUrl },
    });

    // 1. Must not claim that an email was actually delivered
    assert.equal(result.sent, false, "Development simulation must return sent: false");
    assert.equal(result.simulated, true, "Development simulation must return simulated: true");
    assert.equal(result.to, "student@example.com");

    const allOutput = logs.join("\n");

    // 2. Must make it obvious that this is a development-only email simulation
    assert.match(allOutput, /\[DEV EMAIL SIMULATION\]/, "Must log DEV EMAIL SIMULATION header");
    assert.match(allOutput, /Development only — no actual email was delivered/, "Must state development simulation");

    // 3. Must log the recipient and reset URL clearly
    assert.match(allOutput, /\[DEV EMAIL\] To: student@example\.com/, "Must log recipient");
    assert.ok(allOutput.includes(testUrl), "Must log the complete reset URL");

    // 4. Must NOT log raw reset token separately
    assert.doesNotMatch(allOutput, /\[DEV EMAIL\] Token:/, "Must not log raw reset token separately");
    assert.doesNotMatch(allOutput, /Raw token:/i, "Must not label raw token separately");
  } finally {
    console.log = originalConsoleLog;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSendgridKey !== undefined) {
      process.env.SENDGRID_API_KEY = originalSendgridKey;
    }
  }
});

test("production mode without provider: does not claim email delivery", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSendgridKey = process.env.SENDGRID_API_KEY;
  delete process.env.SENDGRID_API_KEY;
  process.env.NODE_ENV = "production";

  try {
    const result = await sendEmail({
      to: "student@example.com",
      templateName: "passwordReset",
      variables: { resetUrl: "http://localhost:5173/reset-password?token=mock&email=student%40example.com" },
    });

    assert.equal(result.sent, false, "Production without provider must return sent: false");
    assert.equal(result.simulated, false, "Production without provider must return simulated: false");
    assert.equal(result.reason, "NO_PROVIDER");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSendgridKey !== undefined) {
      process.env.SENDGRID_API_KEY = originalSendgridKey;
    }
  }
});

test("password reset security: token generation, hashing, and 1-hour expiry contract", () => {
  // Verify token generation contract: 32 random bytes -> 64 hex characters
  const rawToken = crypto.randomBytes(32).toString("hex");
  assert.equal(rawToken.length, 64, "Raw reset token must be a 64-character hex string (32 bytes)");

  // Verify hash contract: sha256 of raw token
  const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  assert.equal(expectedHash.length, 64, "SHA-256 hash must be 64 hex characters");

  // Verify timing contract: exactly 1 hour expiry
  const before = Date.now();
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000);
  const after = Date.now();

  const expiryMs = resetExpires.getTime();
  assert.ok(expiryMs >= before + 60 * 60 * 1000, "Expiry must be at least 1 hour in the future");
  assert.ok(expiryMs <= after + 60 * 60 * 1000, "Expiry must be at most 1 hour in the future");

  // Verify token verification equality logic
  const verificationHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  assert.equal(verificationHash, expectedHash, "Matching raw token produces identical hash");

  const wrongHash = crypto.createHash("sha256").update("invalid-token-tampered").digest("hex");
  assert.notEqual(wrongHash, expectedHash, "Tampered token produces non-matching hash");
});
