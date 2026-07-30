import type { Request, Response } from "express";
import { getPool } from "../database/connection";
import { absenceAttachmentService } from "../services/absence-attachment.service";
import { isGcsConfigured } from "../services/attachment-storage";

interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

interface DatabaseHealthResponse {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  message?: string;
}

interface ReadinessResponse {
  status: "ok" | "degraded" | "error";
  database: "connected" | "disconnected";
  gcs: {
    configured: boolean;
    available: boolean;
    message?: string | null;
  };
  timestamp: string;
}

export const getApiHealth = (_req: Request, res: Response<HealthResponse>): void => {
  res.status(200).json({
    status: "ok",
    service: "dinamic-attendance-api",
    timestamp: new Date().toISOString(),
  });
};

export const getDatabaseHealth = async (
  _req: Request,
  res: Response<DatabaseHealthResponse>,
): Promise<void> => {
  try {
    const pool = getPool();
    await pool.request().query("SELECT 1 AS ok");

    res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected",
      message: "No se pudo conectar con la base de datos",
    });
  }
};

/** Readiness: DB required; GCS reported when configured (attachments depend on it). */
export const getReadiness = async (
  _req: Request,
  res: Response<ReadinessResponse>,
): Promise<void> => {
  let database: "connected" | "disconnected" = "disconnected";
  try {
    const pool = getPool();
    await pool.request().query("SELECT 1 AS ok");
    database = "connected";
  } catch {
    database = "disconnected";
  }

  const gcsHealth = await absenceAttachmentService.getStorageHealth();
  const gcs = {
    configured: isGcsConfigured() || gcsHealth.configured,
    available: gcsHealth.available,
    message: gcsHealth.message ?? null,
  };

  if (database === "disconnected") {
    res.status(503).json({
      status: "error",
      database,
      gcs,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const status = gcs.configured && !gcs.available ? "degraded" : "ok";
  res.status(200).json({
    status,
    database,
    gcs,
    timestamp: new Date().toISOString(),
  });
};
