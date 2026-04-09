import { env } from "../env.js";
import * as oauth from "../oauth.js";

/**
 * Fail-closed startup check: refuse to start if any required env var is
 * missing in production. All reads go through env() so Railway's
 * surrounding-quote habit is absorbed instead of silently passing the check
 * with a non-empty `"foo"` string.
 */
export function assertRequiredEnv(): void {
  if (oauth.ALLOW_UNAUTHENTICATED) return;

  if (!env("OAUTH_CLIENT_ID") || !env("OAUTH_CLIENT_SECRET")) {
    console.error(
      "FATAL: OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are required in production. " +
        "Set ALLOW_UNAUTHENTICATED=1 for local dev only."
    );
    process.exit(1);
  }
  if (!env("OWNER_PASSWORD")) {
    console.error(
      "FATAL: OWNER_PASSWORD is required. It gates who can complete the OAuth authorize step."
    );
    process.exit(1);
  }
  if (!env("OAUTH_REDIRECT_URIS")) {
    console.error(
      "FATAL: OAUTH_REDIRECT_URIS is required (comma-separated whitelist of allowed redirect URIs)."
    );
    process.exit(1);
  }
  if (!env("KAITEN_HOST") || !env("KAITEN_TOKEN")) {
    console.error("FATAL: KAITEN_HOST and KAITEN_TOKEN are required.");
    process.exit(1);
  }
}
