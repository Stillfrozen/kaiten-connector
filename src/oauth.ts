import { randomUUID, createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// --- Config ---

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;

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

interface RegisteredClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, Token>();
const registeredClients = new Map<string, RegisteredClient>();

// Register pre-configured client
if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  registeredClients.set(OAUTH_CLIENT_ID, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    redirect_uris: [],
  });
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
  for (const [k, v] of accessTokens)
    if (v.expiresAt < now) accessTokens.delete(k);
}, 60_000);

// --- Helpers ---

function getServerUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  return `${proto}://${host}`;
}

function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string
): boolean {
  if (method === "S256") {
    const hash = createHash("sha256").update(codeVerifier).digest("base64url");
    return hash === codeChallenge;
  }
  return codeVerifier === codeChallenge;
}

function validateClient(
  clientId: string,
  clientSecret?: string
): RegisteredClient | null {
  const client = registeredClients.get(clientId);
  if (!client) return null;
  if (clientSecret && client.client_secret !== clientSecret) return null;
  return client;
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

/** POST /oauth/register — Dynamic Client Registration (RFC 7591) */
export function registerClient(req: Request, res: Response) {
  const { client_name, redirect_uris } = req.body;
  const clientId = randomUUID();
  const clientSecret = randomUUID();

  const client: RegisteredClient = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirect_uris || [],
  };
  registeredClients.set(clientId, client);

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: client_name || "MCP Client",
    redirect_uris: client.redirect_uris,
  });
}

/** GET /oauth/authorize — Authorization endpoint */
export function authorize(req: Request, res: Response) {
  const {
    response_type,
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = req.query as Record<string, string>;

  if (response_type !== "code") {
    res.status(400).send("Unsupported response_type");
    return;
  }

  if (!client_id || !registeredClients.has(client_id)) {
    res.status(400).send("Unknown client_id");
    return;
  }

  if (!code_challenge) {
    res.status(400).send("PKCE code_challenge is required");
    return;
  }

  // Show a simple authorization page
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize Kaiten MCP</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
  .card { background: white; border-radius: 12px; padding: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px; text-align: center; }
  h1 { font-size: 1.3rem; margin: 0 0 0.5rem; }
  p { color: #666; margin: 0 0 1.5rem; }
  button { background: #2563eb; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
  button:hover { background: #1d4ed8; }
</style></head>
<body><div class="card">
  <h1>Kaiten MCP Server</h1>
  <p>Claude wants to access your Kaiten data.</p>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${client_id}">
    <input type="hidden" name="redirect_uri" value="${redirect_uri || ""}">
    <input type="hidden" name="state" value="${state || ""}">
    <input type="hidden" name="code_challenge" value="${code_challenge}">
    <input type="hidden" name="code_challenge_method" value="${code_challenge_method || "S256"}">
    <button type="submit">Authorize</button>
  </form>
</div></body></html>`;

  res.type("html").send(html);
}

/** POST /oauth/authorize — User approves, redirect with code */
export function authorizeApprove(req: Request, res: Response) {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } =
    req.body;

  if (!client_id || !registeredClients.has(client_id)) {
    res.status(400).send("Unknown client_id");
    return;
  }

  const code = randomUUID();
  authCodes.set(code, {
    code,
    clientId: client_id,
    redirectUri: redirect_uri || "",
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || "S256",
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min
  });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.redirect(url.toString());
}

/** POST /oauth/token — Token endpoint */
export function token(req: Request, res: Response) {
  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } =
    req.body;

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
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  if (authCode.clientId !== client_id) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  // Verify PKCE
  if (!code_verifier || !verifyPkce(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    return;
  }

  // Consume the code
  authCodes.delete(code);

  // Issue token
  const accessToken = randomUUID();
  const expiresIn = 3600; // 1 hour
  accessTokens.set(accessToken, {
    accessToken,
    clientId: client_id,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: expiresIn,
  });
}

// --- Auth middleware for MCP endpoints ---

export function requireBearerAuth(req: Request, res: Response, next: NextFunction) {
  // If no OAuth configured at all, skip auth
  if (!OAUTH_CLIENT_ID && registeredClients.size === 0) {
    return next();
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
