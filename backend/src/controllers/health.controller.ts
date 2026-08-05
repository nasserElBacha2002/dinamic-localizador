import type { Request, Response } from "express";
import { dbProbe } from "../database/db-probe";

/**
 * Public health policy:
 * - /health          → liveness (process up). No dependency details.
 * - /health/ready    → readiness (SQL reachable). Opaque status only.
 * - /health/database → alias of readiness for legacy deploy probes.
 *
 * Detailed SQL/GCS diagnostics live under /platform/servers/status (Super Admin only).
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

const probeDatabaseReady = async (): Promise<boolean> => {
  try {
    await dbProbe.ping();
    return true;
  } catch {
    return false;
  }
};

export const getReadiness = async (
  _req: Request,
  res: Response<ReadinessResponse>,
): Promise<void> => {
  const ready = await probeDatabaseReady();
  const payload: ReadinessResponse = {
    status: ready ? "ok" : "error",
    timestamp: new Date().toISOString(),
  };
  res.status(ready ? 200 : 503).json(payload);
};

/** @deprecated Prefer /health/ready. Kept as opaque readiness alias for deploy scripts. */
export const getDatabaseHealth = getReadiness;
