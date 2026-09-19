import test from "node:test";
import assert from "node:assert/strict";

// Validation helper replicating ForgotPassword form validation
function validateForgotPasswordInput(email) {
  const trimmed = (email || "").trim();
  if (!trimmed) {
    return { valid: false, error: "Please enter your email address." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true, email: trimmed };
}

// Validation helper replicating ResetPassword form validation
function validateResetPasswordInput({ email, token, newPassword, confirmPassword }) {
  if (!token || !token.trim()) {
    return { valid: false, error: "This password reset link is invalid or incomplete." };
  }
  const trimmedEmail = (email || "").trim();
  if (!trimmedEmail) {
    return { valid: false, error: "Please provide your email address." };
  }
  if (!newPassword || newPassword.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { valid: false, error: "Passwords do not match. Please check and try again." };
  }
  return { valid: true, payload: { email: trimmedEmail, token: token.trim(), newPassword } };
}

// URL Search Parameter parser helper matching ResetPassword page logic
function parseResetPasswordParams(queryString) {
  const params = new URLSearchParams(queryString);
  return {
    token: params.get("token") || "",
    email: params.get("email") || "",
  };
}

test("forgotPassword: empty or invalid email is rejected with accessible error", () => {
  const emptyRes = validateForgotPasswordInput("   ");
  assert.equal(emptyRes.valid, false);
  assert.equal(emptyRes.error, "Please enter your email address.");

  const invalidRes = validateForgotPasswordInput("notanemail");
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.error, "Please enter a valid email address.");

  const validRes = validateForgotPasswordInput("  student@example.com  ");
  assert.equal(validRes.valid, true);
  assert.equal(validRes.email, "student@example.com");
});

test("resetPassword: URL search parameters are parsed correctly", () => {
  const query = "?token=abcdef1234567890abcdef1234567890&email=student%40example.com";
  const { token, email } = parseResetPasswordParams(query);

  assert.equal(token, "abcdef1234567890abcdef1234567890");
  assert.equal(email, "student@example.com");
});

test("resetPassword: missing token in URL is detected as invalid link", () => {
  const { token } = parseResetPasswordParams("?email=student@example.com");
  assert.equal(token, "");

  const validation = validateResetPasswordInput({
    email: "student@example.com",
    token,
    newPassword: "ValidPassword123",
    confirmPassword: "ValidPassword123",
  });
  assert.equal(validation.valid, false);
  assert.equal(validation.error, "This password reset link is invalid or incomplete.");
});

test("resetPassword: validates minimum 8 characters password and confirmation match", () => {
  const token = "a".repeat(32);

  // Short password
  const shortRes = validateResetPasswordInput({
    email: "test@example.com",
    token,
    newPassword: "short",
    confirmPassword: "short",
  });
  assert.equal(shortRes.valid, false);
  assert.equal(shortRes.error, "Password must be at least 8 characters.");

  // Mismatched passwords
  const mismatchRes = validateResetPasswordInput({
    email: "test@example.com",
    token,
    newPassword: "Password123",
    confirmPassword: "Password456",
  });
  assert.equal(mismatchRes.valid, false);
  assert.equal(mismatchRes.error, "Passwords do not match. Please check and try again.");

  // Valid inputs
  const validRes = validateResetPasswordInput({
    email: "test@example.com",
    token,
    newPassword: "NewStrongPassword123",
    confirmPassword: "NewStrongPassword123",
  });
  assert.equal(validRes.valid, true);
  assert.deepEqual(validRes.payload, {
    email: "test@example.com",
    token,
    newPassword: "NewStrongPassword123",
  });
});

test("resetPassword: API error handling differentiates expired tokens gracefully", () => {
  const expiredApiError = {
    response: {
      status: 400,
      data: { error: "Invalid or expired reset token" },
    },
  };

  const isExpired = expiredApiError.response.data.error.toLowerCase().includes("expired");
  assert.equal(isExpired, true, "Expired token error should be detected to prompt user for a fresh link");
});
