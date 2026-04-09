import type { NextFunction, Request, Response } from "express";
import { ALLOW_UNAUTHENTICATED, OAUTH_CLIENT_ID } from "./config.js";
import { accessTokens } from "./store.js";
import { getServerUrl } from "./validation.js";

function sendBearerChallenge(
  req: Request,
  res: Response,
  error: string | null,
  body: { error: string }
): void {
  const base = getServerUrl(req);
  const value = error
    ? `Bearer error="${error}", resource_metadata="${base}/.well-known/oauth-protected-resource"`
    : `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`;
  res.status(401).set("WWW-Authenticate", value).json(body);
}

export function requireBearerAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Fail-safe: only skip auth when explicitly opted into unauthenticated dev mode.
  if (ALLOW_UNAUTHENTICATED) {
    next();
    return;
  }

  // Misconfiguration → fail closed (never fail open)
  if (!OAUTH_CLIENT_ID) {
    res.status(503).json({ error: "server_misconfigured" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    sendBearerChallenge(req, res, null, { error: "Unauthorized" });
    return;
  }

  const tokenValue = authHeader.slice(7);
  const tokenData = accessTokens.get(tokenValue);

  if (!tokenData || tokenData.expiresAt < Date.now()) {
    accessTokens.delete(tokenValue);
    sendBearerChallenge(req, res, "invalid_token", {
      error: "Token expired or invalid",
    });
    return;
  }

  next();
}
