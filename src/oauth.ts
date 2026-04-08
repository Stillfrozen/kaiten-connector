import {
  randomUUID,
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { env, stripSurroundingQuotes } from "./env.js";

// --- Config ---

const OAUTH_CLIENT_ID = env("OAUTH_CLIENT_ID");
const OAUTH_CLIENT_SECRET = env("OAUTH_CLIENT_SECRET");
const OWNER_PASSWORD = env("OWNER_PASSWORD");

// Whitelist of allowed redirect URIs (comma-separated). Required in production.
// Each item is also stripped of surrounding quotes in case Railway wrapped
// them individually.
const OAUTH_REDIRECT_URIS = (env("OAUTH_REDIRECT_URIS") || "")
  .split(",")
  .map((s) => stripSurroundingQuotes(s.trim()))
  .filter(Boolean);

// Public hostname for building metadata URLs (prevents Host header injection).
// Railway and Render set these automatically; operator can override.
const PUBLIC_HOSTNAME =
  env("PUBLIC_HOSTNAME") ||
  env("RAILWAY_PUBLIC_DOMAIN") ||
  env("RENDER_EXTERNAL_HOSTNAME") ||
  "";

// Explicit opt-in to skip all authentication (local development only).
export const ALLOW_UNAUTHENTICATED = env("ALLOW_UNAUTHENTICATED") === "1";

const ACCESS_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const REFRESH_TOKEN_TTL = 90 * 24 * 60 * 60; // 90 days in seconds
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CSRF_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// CSRF secret derived from client_secret so it survives restarts with the
// same config. Fresh random in dev to still be unguessable.
const CSRF_SECRET = OAUTH_CLIENT_SECRET
  ? createHash("sha256").update(`csrf:${OAUTH_CLIENT_SECRET}`).digest()
  : randomBytes(32);

// --- In-memory stores ---

interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
}

interface Token {
  accessToken: string;
  clientId: string;
  expiresAt: number;
}

interface RefreshToken {
  refreshToken: string;
  clientId: string;
  expiresAt: number;
}

interface RegisteredClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, Token>();
const refreshTokens = new Map<string, RefreshToken>();
const registeredClients = new Map<string, RegisteredClient>();

// Register pre-configured client
if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  registeredClients.set(OAUTH_CLIENT_ID, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    redirect_uris: OAUTH_REDIRECT_URIS,
  });
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
  for (const [k, v] of accessTokens)
    if (v.expiresAt < now) accessTokens.delete(k);
  for (const [k, v] of refreshTokens)
    if (v.expiresAt < now) refreshTokens.delete(k);
}, 60_000);

// --- Helpers ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function getServerUrl(req: Request): string {
  // In production, build URLs from a trusted env var to prevent Host header
  // injection poisoning the OAuth metadata endpoints.
  if (PUBLIC_HOSTNAME) {
    return `https://${PUBLIC_HOSTNAME}`;
  }
  // Dev fallback: trust the request (express `trust proxy` normalizes these
  // when running behind a reverse proxy).
  const proto = req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function validateRedirectUri(
  client: RegisteredClient,
  redirectUri: string
): boolean {
  // Production: require an explicit whitelist from env.
  if (OAUTH_REDIRECT_URIS.length > 0) {
    return OAUTH_REDIRECT_URIS.includes(redirectUri);
  }
  // Client's own registered URIs (only for dynamically-registered clients in dev).
  if (client.redirect_uris.length > 0) {
    return client.redirect_uris.includes(redirectUri);
  }
  // No whitelist configured → only allowed in unauthenticated dev mode.
  return ALLOW_UNAUTHENTICATED;
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  // Only S256 is supported. `plain` is explicitly rejected to prevent downgrade.
  const hash = createHash("sha256").update(codeVerifier).digest("base64url");
  return timingSafeEqualStr(hash, codeChallenge);
}

function validateClient(
  clientId: string,
  clientSecret?: string
): RegisteredClient | null {
  const client = registeredClients.get(clientId);
  if (!client) return null;
  if (clientSecret && !timingSafeEqualStr(client.client_secret, clientSecret)) {
    return null;
  }
  return client;
}

function issueTokenPair(clientId: string) {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();

  accessTokens.set(accessToken, {
    accessToken,
    clientId,
    expiresAt: Date.now() + ACCESS_TOKEN_TTL * 1000,
  });

  refreshTokens.set(refreshToken, {
    refreshToken,
    clientId,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
  };
}

// --- CSRF token (binds the GET approval form to the POST) ---

interface CsrfPayload {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
}

export function createCsrfToken(payload: CsrfPayload): string {
  const body = Buffer.from(
    JSON.stringify({ p: payload, ts: Date.now() })
  ).toString("base64url");
  const sig = createHmac("sha256", CSRF_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyCsrfToken(token: string, expected: CsrfPayload): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  const expectedSig = createHmac("sha256", CSRF_SECRET)
    .update(body)
    .digest("base64url");
  if (!timingSafeEqualStr(sig, expectedSig)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      p: CsrfPayload;
      ts: number;
    };
    if (typeof parsed.ts !== "number") return false;
    if (Date.now() - parsed.ts > CSRF_TOKEN_TTL_MS) return false;
    return (
      parsed.p.client_id === expected.client_id &&
      parsed.p.redirect_uri === expected.redirect_uri &&
      parsed.p.state === expected.state &&
      parsed.p.code_challenge === expected.code_challenge &&
      parsed.p.code_challenge_method === expected.code_challenge_method
    );
  } catch {
    return false;
  }
}

// --- Authorize page rendering ---

function renderAuthorizePage(opts: {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  csrf_token: string;
  error?: string;
}): string {
  const e = escapeHtml;
  const needsPassword = !!OWNER_PASSWORD;
  const errorBlock = opts.error
    ? `<p class="err">${e(opts.error)}</p>`
    : "";
  const passwordField = needsPassword
    ? `<input type="password" name="owner_password" placeholder="Owner password" required autofocus>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Kaiten MCP</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 0.5rem; }
  p { color: #666; margin: 0 0 1.5rem; }
  input[type=password] { width: 100%; padding: 0.6rem; border: 1px solid #ddd; border-radius: 6px; font-size: 1rem; margin-bottom: 1rem; box-sizing: border-box; }
  button { background: #2563eb; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; width: 100%; }
  button:hover { background: #1d4ed8; }
  .err { color: #b91c1c; background: #fee2e2; padding: 0.5rem; border-radius: 6px; margin-bottom: 1rem; }
</style></head>
<body><div class="card">
  <h1>Kaiten MCP Server</h1>
  <p>Claude wants to access your Kaiten data.</p>
  ${errorBlock}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${e(opts.client_id)}">
    <input type="hidden" name="redirect_uri" value="${e(opts.redirect_uri)}">
    <input type="hidden" name="state" value="${e(opts.state)}">
    <input type="hidden" name="code_challenge" value="${e(opts.code_challenge)}">
    <input type="hidden" name="code_challenge_method" value="${e(opts.code_challenge_method)}">
    <input type="hidden" name="csrf_token" value="${e(opts.csrf_token)}">
    ${passwordField}
    <button type="submit">Authorize</button>
  </form>
</div></body></html>`;
}

// --- Route handlers ---

/** GET /.well-known/oauth-protected-resource */
export function protectedResourceMetadata(req: Request, res: Response) {
  const base = getServerUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
  });
}

/** GET /.well-known/oauth-authorization-server */
export function authServerMetadata(req: Request, res: Response) {
  const base = getServerUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["read"],
  });
}

/** POST /oauth/register — Dynamic Client Registration (RFC 7591).
 *  Disabled in production: operators configure the pre-shared client credentials
 *  manually in Claude's connector UI. Only enabled when unauthenticated dev mode
 *  is explicitly opted into via ALLOW_UNAUTHENTICATED=1.
 */
export function registerClient(req: Request, res: Response) {
  if (!ALLOW_UNAUTHENTICATED) {
    res.status(403).json({
      error: "registration_not_supported",
      error_description:
        "Dynamic client registration is disabled. Configure pre-shared client credentials in the connector UI.",
    });
    return;
  }

  const { client_name, redirect_uris } = req.body ?? {};
  const clientId = randomUUID();
  const clientSecret = randomUUID();

  const client: RegisteredClient = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: Array.isArray(redirect_uris) ? redirect_uris : [],
  };
  registeredClients.set(clientId, client);

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: client_name || "MCP Client",
    redirect_uris: client.redirect_uris,
  });
}

/** GET /oauth/authorize — Authorization endpoint (renders approval form) */
export function authorize(req: Request, res: Response) {
  const {
    response_type,
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query as Record<string, string | undefined>;

  if (response_type !== "code") {
    res.status(400).send("Unsupported response_type");
    return;
  }

  if (!client_id || !registeredClients.has(client_id)) {
    res.status(400).send("Unknown client_id");
    return;
  }
  const client = registeredClients.get(client_id)!;

  if (!code_challenge) {
    res.status(400).send("PKCE code_challenge is required");
    return;
  }

  // Reject any non-S256 PKCE method (prevents downgrade attack)
  const method = code_challenge_method || "S256";
  if (method !== "S256") {
    res.status(400).send("code_challenge_method must be S256");
    return;
  }

  if (!redirect_uri || !validateRedirectUri(client, redirect_uri)) {
    res.status(400).send("Invalid redirect_uri for this client");
    return;
  }

  const csrfToken = createCsrfToken({
    client_id,
    redirect_uri,
    state: state || "",
    code_challenge,
    code_challenge_method: method,
  });

  res.type("html").send(
    renderAuthorizePage({
      client_id,
      redirect_uri,
      state: state || "",
      code_challenge,
      code_challenge_method: method,
      csrf_token: csrfToken,
    })
  );
}

/** POST /oauth/authorize — Owner approves, redirect with code */
export function authorizeApprove(req: Request, res: Response) {
  const {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    csrf_token,
    owner_password,
  } = req.body ?? {};

  // 1. Re-validate all OAuth params (defense in depth — CSRF token also binds these)
  if (!client_id || !registeredClients.has(client_id)) {
    res.status(400).send("Unknown client_id");
    return;
  }
  const client = registeredClients.get(client_id)!;

  if (!code_challenge) {
    res.status(400).send("PKCE code_challenge is required");
    return;
  }

  const method = code_challenge_method || "S256";
  if (method !== "S256") {
    res.status(400).send("code_challenge_method must be S256");
    return;
  }

  if (!redirect_uri || !validateRedirectUri(client, redirect_uri)) {
    res.status(400).send("Invalid redirect_uri for this client");
    return;
  }

  // 2. CSRF: the hidden token must match exactly the params we issued at GET time.
  // This blocks external pages from auto-submitting a crafted approval form.
  const csrfValid = verifyCsrfToken(csrf_token || "", {
    client_id,
    redirect_uri,
    state: state || "",
    code_challenge,
    code_challenge_method: method,
  });
  if (!csrfValid) {
    res.status(400).send("Invalid or expired authorization session. Please retry.");
    return;
  }

  // 3. Owner password check — the only thing gating token issuance.
  // Without this, anyone who reaches the URL can issue tokens to themselves.
  if (OWNER_PASSWORD) {
    if (
      !owner_password ||
      !timingSafeEqualStr(OWNER_PASSWORD, String(owner_password))
    ) {
      // Re-render the form with an error. Re-issue a fresh CSRF token so the
      // owner can retry without triggering the expiry window.
      const freshCsrf = createCsrfToken({
        client_id,
        redirect_uri,
        state: state || "",
        code_challenge,
        code_challenge_method: method,
      });
      res.status(401).type("html").send(
        renderAuthorizePage({
          client_id,
          redirect_uri,
          state: state || "",
          code_challenge,
          code_challenge_method: method,
          csrf_token: freshCsrf,
          error: "Wrong password",
        })
      );
      return;
    }
  } else if (!ALLOW_UNAUTHENTICATED) {
    // Fail-safe: OWNER_PASSWORD must be set unless dev mode is explicit.
    res.status(500).send("Server not configured: OWNER_PASSWORD is required");
    return;
  }

  // 4. Validate redirect URL format + HTTPS (or http://localhost)
  let parsedUri: URL;
  try {
    parsedUri = new URL(redirect_uri);
  } catch {
    res.status(400).send("Invalid redirect_uri format");
    return;
  }

  if (
    parsedUri.protocol !== "https:" &&
    !(parsedUri.protocol === "http:" && parsedUri.hostname === "localhost")
  ) {
    res.status(400).send("redirect_uri must use HTTPS (or HTTP for localhost)");
    return;
  }

  // 5. Issue code and redirect
  const code = randomUUID();
  authCodes.set(code, {
    code,
    clientId: client_id,
    redirectUri: redirect_uri,
    codeChallenge: code_challenge,
    codeChallengeMethod: method,
    expiresAt: Date.now() + AUTH_CODE_TTL_MS,
  });

  parsedUri.searchParams.set("code", code);
  if (state) parsedUri.searchParams.set("state", state);
  res.redirect(parsedUri.toString());
}

/** POST /oauth/token — Token endpoint */
export function token(req: Request, res: Response) {
  const {
    grant_type,
    code,
    client_id,
    client_secret,
    code_verifier,
    refresh_token,
    redirect_uri,
  } = req.body ?? {};

  // --- Refresh token grant ---
  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      res
        .status(400)
        .json({ error: "invalid_request", error_description: "refresh_token required" });
      return;
    }

    // Always require client authentication (RFC 6749 §6)
    if (!validateClient(client_id, client_secret)) {
      res.status(401).json({ error: "invalid_client" });
      return;
    }

    const stored = refreshTokens.get(refresh_token);
    if (!stored || stored.expiresAt < Date.now()) {
      refreshTokens.delete(refresh_token);
      res
        .status(400)
        .json({ error: "invalid_grant", error_description: "Refresh token expired or invalid" });
      return;
    }

    // Bind: refresh token must belong to the authenticated client
    if (stored.clientId !== client_id) {
      refreshTokens.delete(refresh_token);
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    // Rotate: delete old refresh token, issue new pair
    refreshTokens.delete(refresh_token);
    const tokens = issueTokenPair(stored.clientId);
    res.json(tokens);
    return;
  }

  // --- Authorization code grant ---
  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }

  // Validate client
  if (!validateClient(client_id, client_secret)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  // Validate code
  const authCode = authCodes.get(code);
  if (!authCode || authCode.expiresAt < Date.now()) {
    authCodes.delete(code);
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  // Any failure from this point invalidates the code to prevent retry attacks.
  if (authCode.clientId !== client_id) {
    authCodes.delete(code);
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  // Verify redirect_uri matches the one used during authorization
  if (authCode.redirectUri && redirect_uri !== authCode.redirectUri) {
    authCodes.delete(code);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "redirect_uri mismatch",
    });
    return;
  }

  // Verify PKCE (S256 only)
  if (!code_verifier || !verifyPkce(code_verifier, authCode.codeChallenge)) {
    authCodes.delete(code);
    res.status(400).json({
      error: "invalid_grant",
      error_description: "PKCE verification failed",
    });
    return;
  }

  // Consume the code
  authCodes.delete(code);

  // Issue token pair
  const tokens = issueTokenPair(client_id);
  res.json(tokens);
}

// --- Auth middleware for MCP endpoints ---

export function requireBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Fail-safe: only skip auth when explicitly opted into unauthenticated dev mode.
  if (ALLOW_UNAUTHENTICATED) {
    return next();
  }

  // Misconfiguration → fail closed (never fail open)
  if (!OAUTH_CLIENT_ID) {
    res.status(503).json({ error: "server_misconfigured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    const base = getServerUrl(req);
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
      )
      .json({ error: "Unauthorized" });
    return;
  }

  const tokenValue = authHeader.slice(7);
  const tokenData = accessTokens.get(tokenValue);

  if (!tokenData || tokenData.expiresAt < Date.now()) {
    accessTokens.delete(tokenValue);
    const base = getServerUrl(req);
    res
      .status(401)
      .set(
        "WWW-Authenticate",
        `Bearer error="invalid_token", resource_metadata="${base}/.well-known/oauth-protected-resource"`
      )
      .json({ error: "Token expired or invalid" });
    return;
  }

  next();
}
