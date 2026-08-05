/** Shared platform server-status contract (must match backend Zod schema). */

export type PlatformOverallStatus = "ok" | "degraded" | "error";
export type PlatformComponentStatus = "ok" | "error";
export type PlatformGcsStatus = "ok" | "degraded" | "error" | "disabled";

export interface PlatformServerStatus {
  status: PlatformOverallStatus;
  backend: {
    status: "ok";
    service: string;
    checkedAt: string;
  };
  database: {
    status: PlatformComponentStatus;
    message: string | null;
    durationMs: number;
    checkedAt: string;
  };
  gcs: {
    status: PlatformGcsStatus;
    message: string | null;
    durationMs: number;
    checkedAt: string;
  };
  timestamp: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error("Respuesta de estado de servidores inválida.");
}

export function parsePlatformServerStatus(value: unknown): PlatformServerStatus {
  if (!isRecord(value)) {
    throw new Error("Respuesta de estado de servidores inválida.");
  }

  const backend = value.backend;
  const database = value.database;
  const gcs = value.gcs;

  if (
    (value.status !== "ok" && value.status !== "degraded" && value.status !== "error") ||
    !isRecord(backend) ||
    !isRecord(database) ||
    !isRecord(gcs) ||
    typeof value.timestamp !== "string" ||
    backend.status !== "ok" ||
    typeof backend.service !== "string" ||
    typeof backend.checkedAt !== "string" ||
    (database.status !== "ok" && database.status !== "error") ||
    typeof database.durationMs !== "number" ||
    typeof database.checkedAt !== "string" ||
    (gcs.status !== "ok" &&
      gcs.status !== "degraded" &&
      gcs.status !== "error" &&
      gcs.status !== "disabled") ||
    typeof gcs.durationMs !== "number" ||
    typeof gcs.checkedAt !== "string"
  ) {
    throw new Error("Respuesta de estado de servidores inválida.");
  }

  return {
    status: value.status,
    backend: {
      status: "ok",
      service: backend.service,
      checkedAt: backend.checkedAt,
    },
    database: {
      status: database.status,
      message: asNullableString(database.message),
      durationMs: database.durationMs,
      checkedAt: database.checkedAt,
    },
    gcs: {
      status: gcs.status,
      message: asNullableString(gcs.message),
      durationMs: gcs.durationMs,
      checkedAt: gcs.checkedAt,
    },
    timestamp: value.timestamp,
  };
}
