import { createHmac } from "node:crypto";
import { CSRF_SECRET, CSRF_TOKEN_TTL_MS } from "./config.js";
import { timingSafeEqualStr } from "./crypto.js";

export interface CsrfPayload {
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
  const sig = createHmac("sha256", CSRF_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function parsePayload(
  body: string
): { p: CsrfPayload; ts: number } | null {
  try {
    const decoded = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as { p: CsrfPayload; ts: number };
    if (typeof decoded.ts !== "number") return null;
    return decoded;
  } catch {
    return null;
  }
}

export function verifyCsrfToken(token: string, expected: CsrfPayload): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (body === undefined || sig === undefined) return false;

  const expectedSig = createHmac("sha256", CSRF_SECRET)
    .update(body)
    .digest("base64url");
  if (!timingSafeEqualStr(sig, expectedSig)) return false;

  const parsed = parsePayload(body);
  if (!parsed) return false;
  if (Date.now() - parsed.ts > CSRF_TOKEN_TTL_MS) return false;

  return (
    parsed.p.client_id === expected.client_id &&
    parsed.p.redirect_uri === expected.redirect_uri &&
    parsed.p.state === expected.state &&
    parsed.p.code_challenge === expected.code_challenge &&
    parsed.p.code_challenge_method === expected.code_challenge_method
  );
}
