import { createHash, randomBytes } from "node:crypto";
import { env, stripSurroundingQuotes } from "../env.js";

// Env-driven OAuth configuration. Every read goes through env() so Railway's
// surrounding-quote habit is absorbed before it can break startup.

export const OAUTH_CLIENT_ID = env("OAUTH_CLIENT_ID");
export const OAUTH_CLIENT_SECRET = env("OAUTH_CLIENT_SECRET");
export const OWNER_PASSWORD = env("OWNER_PASSWORD");

// Whitelist of allowed redirect URIs (comma-separated). Required in production.
// Each item is stripped of surrounding quotes in case Railway wrapped them
// individually (e.g. `"a","b"` — a common Raw Editor foot-gun).
export const OAUTH_REDIRECT_URIS = (env("OAUTH_REDIRECT_URIS") ?? "")
  .split(",")
  .map((s) => stripSurroundingQuotes(s.trim()))
  .filter(Boolean);

// Public hostname for building metadata URLs (prevents Host header injection).
// Railway and Render set these automatically; operator can override via env.
export const PUBLIC_HOSTNAME =
  env("PUBLIC_HOSTNAME") ??
  env("RAILWAY_PUBLIC_DOMAIN") ??
  env("RENDER_EXTERNAL_HOSTNAME") ??
  "";

// Explicit opt-in to skip all authentication (local development only).
export const ALLOW_UNAUTHENTICATED = env("ALLOW_UNAUTHENTICATED") === "1";

export const ACCESS_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
export const REFRESH_TOKEN_TTL = 90 * 24 * 60 * 60; // 90 days in seconds
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CSRF_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// CSRF secret derived from client_secret so it survives restarts with the
// same config. Fresh random in dev to still be unguessable.
export const CSRF_SECRET = OAUTH_CLIENT_SECRET
  ? createHash("sha256").update(`csrf:${OAUTH_CLIENT_SECRET}`).digest()
  : randomBytes(32);
