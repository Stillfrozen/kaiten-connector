import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import {
  ALLOW_UNAUTHENTICATED,
  AUTH_CODE_TTL_MS,
  OWNER_PASSWORD,
} from "./config.js";
import { createCsrfToken, verifyCsrfToken } from "./csrf.js";
import { timingSafeEqualStr } from "./crypto.js";
import { renderAuthorizePage } from "./html.js";
import { authCodes, registeredClients, type RegisteredClient } from "./store.js";
import { validateRedirectUri } from "./validation.js";

interface AuthorizeParams {
  client: RegisteredClient;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

/**
 * Validate the OAuth params from either query (GET) or body (POST).
 * Writes the appropriate 400 response and returns null on any failure.
 */
function validateAuthorizeParams(
  src: Record<string, string | undefined>,
  res: Response
): AuthorizeParams | null {
  const {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = src;

  if (!client_id || !registeredClients.has(client_id)) {
    res.status(400).send("Unknown client_id");
    return null;
  }
  const client = registeredClients.get(client_id);
  if (!client) {
    res.status(400).send("Unknown client_id");
    return null;
  }

  if (!code_challenge) {
    res.status(400).send("PKCE code_challenge is required");
    return null;
  }

  // Reject any non-S256 PKCE method (prevents downgrade attack)
  const method = code_challenge_method ?? "S256";
  if (method !== "S256") {
    res.status(400).send("code_challenge_method must be S256");
    return null;
  }

  if (!redirect_uri || !validateRedirectUri(client, redirect_uri)) {
    res.status(400).send("Invalid redirect_uri for this client");
    return null;
  }

  return {
    client,
    client_id,
    redirect_uri,
    state: state ?? "",
    code_challenge,
    code_challenge_method: method,
  };
}

// Strict CSP + no-store for the approval page. The page only references inline
// CSS and submits back to the same origin, so `'self'` + `'unsafe-inline'` for
// styles is the tightest policy that still renders.
const AUTHORIZE_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function sendAuthorizePage(res: Response, status: number, html: string): void {
  res
    .status(status)
    .type("html")
    .setHeader("Cache-Control", "no-store")
    .setHeader("Content-Security-Policy", AUTHORIZE_PAGE_CSP)
    .send(html);
}

/** GET /oauth/authorize — renders the owner approval form */
export function authorize(req: Request, res: Response): void {
  const query = req.query as Record<string, string | undefined>;
  if (query.response_type !== "code") {
    res.status(400).send("Unsupported response_type");
    return;
  }

  const params = validateAuthorizeParams(query, res);
  if (!params) return;

  const csrfToken = createCsrfToken({
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
  });

  sendAuthorizePage(
    res,
    200,
    renderAuthorizePage({
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      state: params.state,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      csrf_token: csrfToken,
    })
  );
}

/** Re-render the form with a fresh CSRF token and an error message. */
function renderWithError(
  res: Response,
  params: AuthorizeParams,
  status: number,
  error: string
): void {
  const freshCsrf = createCsrfToken({
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
  });
  sendAuthorizePage(
    res,
    status,
    renderAuthorizePage({
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      state: params.state,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      csrf_token: freshCsrf,
      error,
    })
  );
}

/** Return true if the password is valid (or no password is required in dev). */
function checkOwnerPassword(
  ownerPassword: string | undefined,
  res: Response,
  params: AuthorizeParams
): boolean {
  if (OWNER_PASSWORD) {
    if (
      !ownerPassword ||
      !timingSafeEqualStr(OWNER_PASSWORD, String(ownerPassword))
    ) {
      renderWithError(res, params, 401, "Wrong password");
      return false;
    }
    return true;
  }
  if (!ALLOW_UNAUTHENTICATED) {
    // Fail-safe: OWNER_PASSWORD must be set unless dev mode is explicit.
    res.status(500).send("Server not configured: OWNER_PASSWORD is required");
    return false;
  }
  return true;
}

/** Parse + format-check the redirect URI (must be https, or http for localhost). */
function parseRedirectUri(redirectUri: string, res: Response): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    res.status(400).send("Invalid redirect_uri format");
    return null;
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && parsed.hostname === "localhost")
  ) {
    res.status(400).send("redirect_uri must use HTTPS (or HTTP for localhost)");
    return null;
  }
  return parsed;
}

/** POST /oauth/authorize — owner approves, redirect with code */
export function authorizeApprove(req: Request, res: Response): void {
  const body = (req.body ?? {}) as Record<string, string | undefined>;

  // 1. Re-validate all OAuth params (defense in depth — CSRF also binds these)
  const params = validateAuthorizeParams(body, res);
  if (!params) return;

  // 2. CSRF: the hidden token must match exactly the params we issued at GET time.
  //    This blocks external pages from auto-submitting a crafted approval form.
  const csrfValid = verifyCsrfToken(body.csrf_token ?? "", {
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    state: params.state,
    code_challenge: params.code_challenge,
    code_challenge_method: params.code_challenge_method,
  });
  if (!csrfValid) {
    res.status(400).send("Invalid or expired authorization session. Please retry.");
    return;
  }

  // 3. Owner password check — the only thing gating token issuance.
  if (!checkOwnerPassword(body.owner_password, res, params)) return;

  // 4. Validate redirect URL format + HTTPS (or http://localhost)
  const parsedUri = parseRedirectUri(params.redirect_uri, res);
  if (!parsedUri) return;

  // 5. Issue code and redirect
  const code = randomUUID();
  authCodes.set(code, {
    code,
    clientId: params.client_id,
    redirectUri: params.redirect_uri,
    codeChallenge: params.code_challenge,
    codeChallengeMethod: params.code_challenge_method,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
  });

  parsedUri.searchParams.set("code", code);
  if (params.state) parsedUri.searchParams.set("state", params.state);
  res.redirect(parsedUri.toString());
}
