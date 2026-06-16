import type { Request, Response } from "express";
import { getPool } from "../database/connection";

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
