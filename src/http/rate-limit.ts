import type { Request, Response } from "express";

// Hard cap on unique IPs tracked simultaneously. Prevents a botnet (or a
// misconfigured reverse proxy letting clients spoof X-Forwarded-For) from
// growing the hit Map unboundedly and exhausting memory.
const MAX_TRACKED_IPS = 10_000;

interface HitEntry {
  count: number;
  reset: number;
}

type Limiter = (req: Request, res: Response, next: () => void) => void;

function rateLimited(res: Response, retryAfterSec: number): void {
  res
    .status(429)
    .set("Retry-After", String(retryAfterSec))
    .json({ error: "rate_limited" });
}

/**
 * Simple in-memory rate limiter (per-IP, fixed window).
 *
 * Fails closed on overflow: if the tracking table is full and can't be pruned,
 * new IPs are rejected rather than silently bypassed. Legitimate clients
 * retry after the window.
 */
export function createRateLimiter(windowMs: number, max: number): Limiter {
  const hits = new Map<string, HitEntry>();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();

  return function limiter(req, res, next) {
    const key = req.ip ?? "unknown";
    const now = Date.now();

    // Table full + new key → try to reclaim space, else fail closed.
    if (hits.size >= MAX_TRACKED_IPS && !hits.has(key)) {
      for (const [k, v] of hits) {
        if (v.reset < now) hits.delete(k);
        if (hits.size < MAX_TRACKED_IPS) break;
      }
      if (hits.size >= MAX_TRACKED_IPS) {
        rateLimited(res, Math.ceil(windowMs / 1000));
        return;
      }
    }

    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      next();
      return;
    }
    entry.count++;
    if (entry.count > max) {
      rateLimited(res, Math.ceil((entry.reset - now) / 1000));
      return;
    }
    next();
  };
}
