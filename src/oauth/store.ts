import { randomUUID } from "node:crypto";
import {
  ACCESS_TOKEN_TTL,
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URIS,
  REFRESH_TOKEN_TTL,
} from "./config.js";

// --- Types ---

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: number;
}

export interface Token {
  accessToken: string;
  clientId: string;
  expiresAt: number;
}

export interface RefreshToken {
  refreshToken: string;
  clientId: string;
  // Paired access token — invalidated when this refresh token is rotated,
  // so a compromised access token can be killed by refreshing the chain
  // (RFC 6819 §5.2.2.3).
  accessToken: string;
  expiresAt: number;
}

export interface RegisteredClient {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
}

// --- Stores ---

export const authCodes = new Map<string, AuthCode>();
export const accessTokens = new Map<string, Token>();
export const refreshTokens = new Map<string, RefreshToken>();
export const registeredClients = new Map<string, RegisteredClient>();

// Register the pre-configured client (production) at module load.
if (OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET) {
  registeredClients.set(OAUTH_CLIENT_ID, {
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    redirect_uris: OAUTH_REDIRECT_URIS,
  });
}

// Periodic expiry sweep. Not authoritative — each read also checks expiresAt
// — but keeps the Maps from growing forever under normal operation.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of authCodes) if (v.expiresAt < now) authCodes.delete(k);
  for (const [k, v] of accessTokens)
    if (v.expiresAt < now) accessTokens.delete(k);
  for (const [k, v] of refreshTokens)
    if (v.expiresAt < now) refreshTokens.delete(k);
}, 60_000).unref();

// --- Issuance ---

export interface IssuedTokenPair {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

export function issueTokenPair(clientId: string): IssuedTokenPair {
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
    accessToken,
    expiresAt: Date.now() + REFRESH_TOKEN_TTL * 1000,
  });

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
  };
}

// Testing-only handles on the in-memory stores. Used by oauth.test.ts to
// verify the rotation invariant without spinning up the HTTP layer.
export const __testing__ = {
  accessTokens,
  refreshTokens,
  issueTokenPair,
};
