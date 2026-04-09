import type { Request } from "express";
import {
  ALLOW_UNAUTHENTICATED,
  OAUTH_REDIRECT_URIS,
  PUBLIC_HOSTNAME,
} from "./config.js";
import { timingSafeEqualStr } from "./crypto.js";
import { registeredClients, type RegisteredClient } from "./store.js";

export function getServerUrl(req: Request): string {
  // In production, build URLs from a trusted env var to prevent Host header
  // injection poisoning the OAuth metadata endpoints.
  if (PUBLIC_HOSTNAME) return `https://${PUBLIC_HOSTNAME}`;
  // Dev fallback: trust the request (express `trust proxy` normalizes these
  // when running behind a reverse proxy).
  return `${req.protocol}://${req.get("host") ?? ""}`;
}

export function validateRedirectUri(
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

export function validateClient(
  clientId: string | undefined,
  clientSecret?: string
): RegisteredClient | null {
  if (!clientId) return null;
  const client = registeredClients.get(clientId);
  if (!client) return null;
  if (clientSecret && !timingSafeEqualStr(client.client_secret, clientSecret)) {
    return null;
  }
  return client;
}
