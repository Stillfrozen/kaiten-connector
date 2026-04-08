import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// Set all required env vars BEFORE importing oauth.ts, so the module's
// top-level side effects (CSRF secret derivation, client registration,
// redirect-uri whitelist parsing) initialize with stable, test-controlled values.
process.env.OAUTH_CLIENT_ID = "test-client";
process.env.OAUTH_CLIENT_SECRET = "test-client-secret-long-enough";
process.env.OWNER_PASSWORD = "correct horse battery staple";
process.env.OAUTH_REDIRECT_URIS =
  "https://claude.ai/api/mcp/auth_callback,http://localhost:5000/cb";
process.env.KAITEN_HOST = "example.kaiten.ru";
process.env.KAITEN_TOKEN = "dummy";

const oauth = await import("../src/oauth.js");

// --- timingSafeEqualStr ---

test("timingSafeEqualStr: equal strings", () => {
  assert.equal(oauth.timingSafeEqualStr("abc123", "abc123"), true);
});

test("timingSafeEqualStr: different values, same length", () => {
  assert.equal(oauth.timingSafeEqualStr("abc123", "xyz789"), false);
});

test("timingSafeEqualStr: different lengths", () => {
  assert.equal(oauth.timingSafeEqualStr("short", "longer-string"), false);
});

test("timingSafeEqualStr: empty strings", () => {
  assert.equal(oauth.timingSafeEqualStr("", ""), true);
});

// --- verifyPkce (S256 only) ---

test("verifyPkce: correct S256 verifier/challenge", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64url");
  assert.equal(oauth.verifyPkce(verifier, challenge), true);
});

test("verifyPkce: wrong verifier", () => {
  const verifier = "correct-verifier";
  const challenge = createHash("sha256")
    .update("different-verifier")
    .digest("base64url");
  assert.equal(oauth.verifyPkce(verifier, challenge), false);
});

test("verifyPkce: rejects plain-text PKCE (downgrade attack)", () => {
  // In the old `plain` mode, the verifier equalled the challenge literally.
  // The new implementation hashes the verifier, so a plain-text match fails.
  const sharedValue = "plain-text-challenge";
  assert.equal(oauth.verifyPkce(sharedValue, sharedValue), false);
});

// --- CSRF token ---

const validPayload = {
  client_id: "test-client",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  state: "random-state-value",
  code_challenge: "challenge-value",
  code_challenge_method: "S256",
};

test("CSRF: round-trip validates", () => {
  const token = oauth.createCsrfToken(validPayload);
  assert.equal(oauth.verifyCsrfToken(token, validPayload), true);
});

test("CSRF: tampered signature fails", () => {
  const token = oauth.createCsrfToken(validPayload);
  const [body] = token.split(".");
  const tampered = `${body}.XXXXXXXXXXXXXXXX`;
  assert.equal(oauth.verifyCsrfToken(tampered, validPayload), false);
});

test("CSRF: tampered body fails (signature check catches it)", () => {
  const token = oauth.createCsrfToken(validPayload);
  const parts = token.split(".");
  // Flip a byte in the payload
  const tamperedBody = parts[0].slice(0, -1) + "A";
  const tampered = `${tamperedBody}.${parts[1]}`;
  assert.equal(oauth.verifyCsrfToken(tampered, validPayload), false);
});

test("CSRF: mismatched client_id fails", () => {
  const token = oauth.createCsrfToken(validPayload);
  assert.equal(
    oauth.verifyCsrfToken(token, { ...validPayload, client_id: "attacker" }),
    false
  );
});

test("CSRF: mismatched redirect_uri fails", () => {
  const token = oauth.createCsrfToken(validPayload);
  assert.equal(
    oauth.verifyCsrfToken(token, {
      ...validPayload,
      redirect_uri: "https://evil.example/cb",
    }),
    false
  );
});

test("CSRF: mismatched code_challenge fails", () => {
  const token = oauth.createCsrfToken(validPayload);
  assert.equal(
    oauth.verifyCsrfToken(token, {
      ...validPayload,
      code_challenge: "attacker-challenge",
    }),
    false
  );
});

test("CSRF: mismatched state fails", () => {
  const token = oauth.createCsrfToken(validPayload);
  assert.equal(
    oauth.verifyCsrfToken(token, { ...validPayload, state: "replaced" }),
    false
  );
});

test("CSRF: malformed token (no dot) fails", () => {
  assert.equal(oauth.verifyCsrfToken("garbage", validPayload), false);
});

test("CSRF: empty token fails", () => {
  assert.equal(oauth.verifyCsrfToken("", validPayload), false);
});

// --- Token rotation invariant (M-1) ---
//
// The refresh grant must invalidate the OLD access token paired with a
// refresh token when it rotates. Otherwise a compromised access token
// survives the 7-day TTL even after the owner refreshes.

test("issueTokenPair: stores access and refresh, paired", () => {
  const { accessTokens, refreshTokens, issueTokenPair } = oauth.__testing__;
  const pair = issueTokenPair("test-client");

  assert.equal(accessTokens.has(pair.access_token), true);
  assert.equal(refreshTokens.has(pair.refresh_token), true);

  const refreshEntry = refreshTokens.get(pair.refresh_token)!;
  assert.equal(
    refreshEntry.accessToken,
    pair.access_token,
    "refresh token must carry a reference to its paired access token"
  );

  // Cleanup
  accessTokens.delete(pair.access_token);
  refreshTokens.delete(pair.refresh_token);
});

test("rotation: deleting old access on refresh kills the stale token", () => {
  const { accessTokens, refreshTokens, issueTokenPair } = oauth.__testing__;

  // Simulate: client gets a pair, then rotates.
  const firstPair = issueTokenPair("test-client");
  const oldAccess = firstPair.access_token;
  const oldRefresh = firstPair.refresh_token;

  // Sanity: old access is valid before rotation
  assert.equal(accessTokens.has(oldAccess), true);

  // Perform the rotation exactly like the refresh grant does.
  const stored = refreshTokens.get(oldRefresh)!;
  refreshTokens.delete(oldRefresh);
  accessTokens.delete(stored.accessToken);
  const secondPair = issueTokenPair(stored.clientId);

  // Invariant: old access is gone, new access is valid.
  assert.equal(
    accessTokens.has(oldAccess),
    false,
    "stale access token must be evicted on refresh"
  );
  assert.equal(accessTokens.has(secondPair.access_token), true);
  assert.equal(refreshTokens.has(secondPair.refresh_token), true);
  assert.equal(refreshTokens.has(oldRefresh), false);

  // Cleanup
  accessTokens.delete(secondPair.access_token);
  refreshTokens.delete(secondPair.refresh_token);
});
