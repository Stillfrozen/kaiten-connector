import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { ALLOW_UNAUTHENTICATED } from "./config.js";
import { registeredClients, type RegisteredClient } from "./store.js";
import { getServerUrl } from "./validation.js";

/** GET /.well-known/oauth-protected-resource */
export function protectedResourceMetadata(req: Request, res: Response): void {
  const base = getServerUrl(req);
  res.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
    bearer_methods_supported: ["header"],
  });
}

/** GET /.well-known/oauth-authorization-server */
export function authServerMetadata(req: Request, res: Response): void {
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

/**
 * POST /oauth/register — Dynamic Client Registration (RFC 7591).
 *
 * Disabled in production: operators configure the pre-shared client credentials
 * manually in Claude's connector UI. Only enabled when unauthenticated dev mode
 * is explicitly opted into via ALLOW_UNAUTHENTICATED=1.
 */
export function registerClient(req: Request, res: Response): void {
  if (!ALLOW_UNAUTHENTICATED) {
    res.status(403).json({
      error: "registration_not_supported",
      error_description:
        "Dynamic client registration is disabled. Configure pre-shared client credentials in the connector UI.",
    });
    return;
  }

  const body = (req.body ?? {}) as {
    client_name?: string;
    redirect_uris?: string[];
  };
  const clientId = randomUUID();
  const clientSecret = randomUUID();

  const client: RegisteredClient = {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
  };
  registeredClients.set(clientId, client);

  res.status(201).json({
    client_id: clientId,
    client_secret: clientSecret,
    client_name: body.client_name ?? "MCP Client",
    redirect_uris: client.redirect_uris,
  });
}
