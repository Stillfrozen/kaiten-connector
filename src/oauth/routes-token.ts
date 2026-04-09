import type { Request, Response } from "express";
import { verifyPkce } from "./crypto.js";
import {
  accessTokens,
  authCodes,
  issueTokenPair,
  refreshTokens,
} from "./store.js";
import { validateClient } from "./validation.js";

interface TokenBody {
  grant_type?: string;
  code?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  refresh_token?: string;
  redirect_uri?: string;
}

/**
 * refresh_token grant: rotate the token pair, killing both the old refresh
 * AND its paired access token (RFC 6819 §5.2.2.3) so a stolen access token
 * can be revoked by the owner performing a refresh.
 */
function handleRefreshGrant(body: TokenBody, res: Response): void {
  const { refresh_token, client_id, client_secret } = body;
  if (!refresh_token) {
    res.status(400).json({
      error: "invalid_request",
      error_description: "refresh_token required",
    });
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
    res.status(400).json({
      error: "invalid_grant",
      error_description: "Refresh token expired or invalid",
    });
    return;
  }

  // Bind: refresh token must belong to the authenticated client
  if (stored.clientId !== client_id) {
    refreshTokens.delete(refresh_token);
    accessTokens.delete(stored.accessToken);
    res.status(400).json({ error: "invalid_grant" });
    return;
  }

  // Rotate: invalidate the old refresh AND its paired access token, then issue
  // a fresh pair.
  refreshTokens.delete(refresh_token);
  accessTokens.delete(stored.accessToken);
  res.json(issueTokenPair(stored.clientId));
}

/** authorization_code grant: validate code, client, PKCE, redirect_uri. */
function handleAuthCodeGrant(body: TokenBody, res: Response): void {
  const { code, client_id, client_secret, code_verifier, redirect_uri } = body;

  if (!validateClient(client_id, client_secret)) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
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

  // Consume the code and issue tokens. client_id is non-null here because
  // validateClient() above guarantees it.
  authCodes.delete(code);
  res.json(issueTokenPair(authCode.clientId));
}

/** POST /oauth/token — dispatch by grant_type. */
export function token(req: Request, res: Response): void {
  const body = (req.body ?? {}) as TokenBody;

  if (body.grant_type === "refresh_token") {
    handleRefreshGrant(body, res);
    return;
  }
  if (body.grant_type === "authorization_code") {
    handleAuthCodeGrant(body, res);
    return;
  }
  res.status(400).json({ error: "unsupported_grant_type" });
}
