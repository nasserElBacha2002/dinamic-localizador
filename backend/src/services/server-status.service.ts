import { env } from "../config/env";
import { dbProbe } from "../database/db-probe";
import type { PlatformServerStatusDto } from "../schemas/platform-server-status.schema";
import { attachmentStorageHealthProbe } from "./attachment-storage/storage-health";
import { raceTimeout } from "../utils/race-timeout";

export type PlatformServerStatus = PlatformServerStatusDto;

const checkDatabase = async (
  timeoutMs: number,
): Promise<PlatformServerStatus["database"]> => {
  const started = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    const raced = await raceTimeout(dbProbe.ping().then(() => true as const), timeoutMs);

    if (raced.timedOut) {
      console.error("[server-status] SQL check timed out", { timeoutMs });
      return {
        status: "error",
        message: "Tiempo de espera agotado al consultar la base de datos",
        durationMs: Date.now() - started,
        checkedAt,
      };
    }

    return {
      status: "ok",
      message: null,
      durationMs: Date.now() - started,
      checkedAt,
    };
  } catch (error) {
    console.error("[server-status] SQL check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "error",
      message: "No se pudo conectar con la base de datos",
      durationMs: Date.now() - started,
      checkedAt,
    };
  }
};

const resolveOverallStatus = (
  database: PlatformServerStatus["database"],
  gcs: PlatformServerStatus["gcs"],
): PlatformServerStatus["status"] => {
  if (database.status === "error") {
    return "error";
  }

  if (env.GCS_REQUIRED) {
    if (gcs.status === "disabled" || gcs.status === "error") {
      return "error";
    }
    if (gcs.status === "degraded") {
      return "degraded";
    }
    return "ok";
  }

  if (gcs.status === "error" || gcs.status === "degraded") {
    return "degraded";
  }

  return "ok";
};

export const serverStatusService = {
  async getPlatformStatus(): Promise<PlatformServerStatus> {
    const timeoutMs = env.PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS;
    const timestamp = new Date().toISOString();

    const [database, storage] = await Promise.all([
      checkDatabase(timeoutMs),
      attachmentStorageHealthProbe.check(timeoutMs),
    ]);

    const gcs: PlatformServerStatus["gcs"] = {
      status: storage.status,
      message: storage.message,
      durationMs: storage.durationMs,
      checkedAt: storage.checkedAt,
    };

    return {
      status: resolveOverallStatus(database, gcs),
      backend: {
        status: "ok",
        service: env.API_SERVICE_NAME,
        checkedAt: timestamp,
      },
      database,
      gcs,
      timestamp,
    };
  },
};
