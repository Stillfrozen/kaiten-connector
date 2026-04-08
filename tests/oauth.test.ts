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
