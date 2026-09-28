import type { Request, Response } from "express";
import { env } from "../config/env";
import { dbProbe } from "../database/db-probe";
import * as rateLimitStore from "../services/rate-limit-store";

/**
 * Public health policy:
 * - /health          → liveness (process up). No dependency details.
 * - /health/ready    → readiness (SQL reachable + required schemas). Opaque status only.
 * - /health/database → alias of readiness for legacy deploy probes.
 *
 * Detailed SQL/GCS diagnostics live under /platform/servers/status (Super Admin only).
 *
 * Deployment order for distributed rate limit:
 *   migration 140 → readiness verification → backend rollout
 */

interface LivenessResponse {
  status: "ok";
  timestamp: string;
}

interface ReadinessResponse {
  status: "ok" | "error";
  timestamp: string;
}

export const getApiHealth = (_req: Request, res: Response<LivenessResponse>): void => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
};

const resolveRateLimitBackend = (): "sql" | "memory" => {
  // Read process.env at call time so unit tests can force memory without reloading env.ts.
  const configured = process.env.RATE_LIMIT_BACKEND;
  if (configured === "sql" || configured === "memory") {
    return configured;
  }
  return env.NODE_ENV === "test" ? "memory" : "sql";
};

const probeDatabaseReady = async (): Promise<boolean> => {
  try {
    await dbProbe.ping();
    return true;
  } catch {
    return false;
  }
};

const probeRateLimitReady = async (): Promise<boolean> => {
  if (resolveRateLimitBackend() !== "sql") {
    return true;
  }

  try {
    const ready = await rateLimitStore.isRateLimitSchemaReady();
    if (!ready) {
      console.error(
        "[readiness] rate_limit_buckets schema missing — apply migration 140 before serving traffic (RATE_LIMIT_BACKEND=sql)",
      );
    }
    return ready;
  } catch (error) {
    console.error("[readiness] rate_limit schema probe failed", {
      error: error instanceof Error ? error.message : "UNKNOWN",
    });
    return false;
  }
};

export const getReadiness = async (
  _req: Request,
  res: Response<ReadinessResponse>,
): Promise<void> => {
  const dbReady = await probeDatabaseReady();
  const rateLimitReady = dbReady ? await probeRateLimitReady() : false;
  const ready = dbReady && rateLimitReady;
  const payload: ReadinessResponse = {
    status: ready ? "ok" : "error",
    timestamp: new Date().toISOString(),
  };
  res.status(ready ? 200 : 503).json(payload);
};

/** @deprecated Prefer /health/ready. Kept as opaque readiness alias for deploy scripts. */
export const getDatabaseHealth = getReadiness;
