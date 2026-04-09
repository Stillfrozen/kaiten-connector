import { createHash, timingSafeEqual } from "node:crypto";

export function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  // Only S256 is supported. `plain` is explicitly rejected to prevent downgrade.
  const hash = createHash("sha256").update(codeVerifier).digest("base64url");
  return timingSafeEqualStr(hash, codeChallenge);
}
