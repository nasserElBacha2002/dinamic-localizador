import type { NextFunction, Request, Response } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
let lastSweepAt = 0;

function sweepExpired(now: number): void {
  if (now - lastSweepAt < 30_000 && buckets.size < MAX_BUCKETS) {
    return;
  }
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
  // Hard cap against header spoofing / unbounded growth on a single instance.
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      removed += 1;
      if (removed >= overflow) {
        break;
      }
    }
  }
}

/**
 * Client key uses Express `req.ip` (honors `trust proxy`).
 * Do not read x-forwarded-for directly — spoofable when proxy is misconfigured.
 *
 * In-memory only: the limit applies per process. Multi-instance deployments
 * need a shared store to enforce a global cap.
 */
export function defaultRateLimitKey(req: Request, scope: string): string {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const actor = req.auth?.userId ? `:u:${req.auth.userId}` : "";
  const company = req.companyId ? `:c:${req.companyId}` : "";
  return `${scope}:${ip}${actor}${company}`;
}

export function createRateLimiter(options: {
  scope: string;
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweepExpired(now);

    const key = options.key ? options.key(req) : defaultRateLimitKey(req, options.scope);
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Demasiados intentos. Probá de nuevo en unos minutos.",
          retryAfterSeconds: retryAfterSec,
        },
      });
      return;
    }

    next();
  };
}

/** Test helper: clear buckets between unit tests. */
export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
  lastSweepAt = 0;
}
