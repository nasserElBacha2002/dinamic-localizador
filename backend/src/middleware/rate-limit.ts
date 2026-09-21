import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import {
  createMemoryRateLimitStore,
  createSqlRateLimitStore,
  type RateLimitStore,
} from "../services/rate-limit-store";

interface Bucket {
  count: number;
  resetAt: number;
}

/** @deprecated process-local map retained only for tests via memory store. */
const buckets = new Map<string, Bucket>();

let sharedStore: RateLimitStore | null = null;

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
  sharedStore = createMemoryRateLimitStore(buckets);
}

function resolveBackend(): "sql" | "memory" {
  return env.RATE_LIMIT_BACKEND ?? (env.NODE_ENV === "test" ? "memory" : "sql");
}

function getStore(): RateLimitStore {
  if (sharedStore) {
    return sharedStore;
  }

  if (resolveBackend() === "memory") {
    sharedStore = createMemoryRateLimitStore(buckets);
    return sharedStore;
  }

  sharedStore = createSqlRateLimitStore();
  return sharedStore;
}

/** Shared store used by middleware and cleanup job. */
export function getRateLimitStore(): RateLimitStore {
  return getStore();
}

/** Test/harness: inject store (e.g. shared memory across logical "instances"). */
export function setRateLimitStoreForTests(store: RateLimitStore | null): void {
  sharedStore = store;
}

/**
 * Client key uses Express `req.ip` (honors `trust proxy`).
 * Do not read x-forwarded-for directly — spoofable when proxy is misconfigured.
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
  /** When store fails: fail-closed (503) by default for auth-sensitive routes. */
  onStoreFailure?: "fail_closed" | "fail_open";
}) {
  const onStoreFailure = options.onStoreFailure ?? "fail_closed";

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.key ? options.key(req) : defaultRateLimitKey(req, options.scope);

    void (async () => {
      try {
        const result = await getStore().hit(key, options.windowMs, options.max);
        if (!result.allowed) {
          const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
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
      } catch (error) {
        console.error("[rate-limit] store failure", {
          scope: options.scope,
          onStoreFailure,
          error: error instanceof Error ? error.message : "UNKNOWN",
        });

        if (onStoreFailure === "fail_open") {
          next();
          return;
        }

        res.status(503).json({
          error: {
            code: "RATE_LIMIT_STORE_UNAVAILABLE",
            message: "Servicio de límite de intentos no disponible. Reintentá más tarde.",
          },
        });
      }
    })();
  };
}
