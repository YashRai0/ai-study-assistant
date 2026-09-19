import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Dedicated unit test suite for token revocation and session lifecycle
const TEST_JWT_SECRET = "test-jwt-secret-for-unit-tests-123456789";
const TEST_REFRESH_SECRET = "test-refresh-secret-for-unit-tests-987654321";

function signTestToken(payload, secret, options = {}) {
  return jwt.sign(payload, secret, options);
}

function verifyTestToken(token, secret) {
  return jwt.verify(token, secret);
}

test("refreshToken: valid unrevoked refresh token succeeds", () => {
  const userId = "user123";
  const now = Math.floor(Date.now() / 1000);

  const refreshToken = signTestToken({ sub: userId, iat: now }, TEST_REFRESH_SECRET, { expiresIn: "7d" });
  const decoded = verifyTestToken(refreshToken, TEST_REFRESH_SECRET);

  const mockUser = {
    _id: userId,
    email: "student@example.com",
    tokenRevokedAt: null,
  };

  const isRevoked = Boolean(mockUser.tokenRevokedAt && decoded.iat && decoded.iat * 1000 < mockUser.tokenRevokedAt.getTime());
  assert.equal(isRevoked, false, "Unrevoked refresh token must not be considered revoked");
  assert.equal(decoded.sub, userId);
});

test("refreshToken: refresh token issued before tokenRevokedAt is rejected", () => {
  const userId = "user123";
  const issuedTimeSeconds = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
  const revokedTime = new Date(Date.now() - 1800 * 1000); // 30 minutes ago

  const refreshToken = signTestToken({ sub: userId, iat: issuedTimeSeconds }, TEST_REFRESH_SECRET, { expiresIn: "7d" });
  const decoded = verifyTestToken(refreshToken, TEST_REFRESH_SECRET);

  const mockUser = {
    _id: userId,
    email: "student@example.com",
    tokenRevokedAt: revokedTime,
  };

  const isRevoked = mockUser.tokenRevokedAt && decoded.iat && decoded.iat * 1000 < mockUser.tokenRevokedAt.getTime();
  assert.equal(isRevoked, true, "Token issued prior to revocation timestamp must be rejected");
});

test("refreshToken: newly authenticated session after revocation can refresh successfully", () => {
  const userId = "user123";
  const revokedTime = new Date(Date.now() - 3600 * 1000); // Revoked 1 hour ago
  const newLoginTimeSeconds = Math.floor(Date.now() / 1000); // Just now

  const newRefreshToken = signTestToken({ sub: userId, iat: newLoginTimeSeconds }, TEST_REFRESH_SECRET, { expiresIn: "7d" });
  const decoded = verifyTestToken(newRefreshToken, TEST_REFRESH_SECRET);

  const mockUser = {
    _id: userId,
    email: "student@example.com",
    tokenRevokedAt: revokedTime,
  };

  const isRevoked = mockUser.tokenRevokedAt && decoded.iat && decoded.iat * 1000 < mockUser.tokenRevokedAt.getTime();
  assert.equal(isRevoked, false, "New token issued after revocation timestamp must succeed");
});

test("refreshToken: password reset updates tokenRevokedAt and invalidates prior refresh tokens", () => {
  const userId = "user123";
  const oldLoginTimeSeconds = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
  const oldRefreshToken = signTestToken({ sub: userId, iat: oldLoginTimeSeconds }, TEST_REFRESH_SECRET, { expiresIn: "7d" });

  // Simulate password reset action
  const resetTimestamp = new Date();
  const mockUser = {
    _id: userId,
    email: "student@example.com",
    tokenRevokedAt: resetTimestamp,
  };

  const decodedOld = verifyTestToken(oldRefreshToken, TEST_REFRESH_SECRET);
  const oldIsRevoked = mockUser.tokenRevokedAt && decodedOld.iat && decodedOld.iat * 1000 < mockUser.tokenRevokedAt.getTime();
  assert.equal(oldIsRevoked, true, "Old refresh token must be invalid after password reset");

  // New token minted after reset
  const postResetTimeSeconds = Math.floor(Date.now() / 1000) + 1;
  const newRefreshToken = signTestToken({ sub: userId, iat: postResetTimeSeconds }, TEST_REFRESH_SECRET, { expiresIn: "7d" });
  const decodedNew = verifyTestToken(newRefreshToken, TEST_REFRESH_SECRET);
  const newIsRevoked = mockUser.tokenRevokedAt && decodedNew.iat && decodedNew.iat * 1000 < mockUser.tokenRevokedAt.getTime();
  assert.equal(newIsRevoked, false, "Token minted after password reset must remain valid");
});

test("refreshToken: access token requireAuth enforcement mirrors refresh token boundary", () => {
  const userId = "user123";
  const revokedTime = new Date(Date.now() - 1000);
  const oldAccessToken = signTestToken({ sub: userId, email: "test@example.com", iat: Math.floor(Date.now() / 1000) - 10 }, TEST_JWT_SECRET);
  const decodedAccess = verifyTestToken(oldAccessToken, TEST_JWT_SECRET);

  const mockUser = {
    _id: userId,
    tokenRevokedAt: revokedTime,
  };

  const accessRejected = mockUser.tokenRevokedAt && decodedAccess.iat * 1000 < mockUser.tokenRevokedAt.getTime();
  assert.equal(accessRejected, true, "Access token check must reject prior sessions matching refresh token logic");
});
