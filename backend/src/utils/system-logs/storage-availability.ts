import { AppError } from "../../errors/app-error";
import { systemRuntimeLogRepository } from "../../repositories/system-runtime-log.repository";
import { systemLogger } from "./logger";

let storageAvailable: boolean | null = null;
let lastUnavailableLogAt = 0;
const UNAVAILABLE_LOG_COOLDOWN_MS = 60_000;

/**
 * Cached availability check for system_runtime_logs.
 * Failures stay fail-open for business flows (sink already degrades);
 * API/UI calls convert absence into HTTP 503.
 */
export const resetSystemLogsStorageAvailabilityForTests = (): void => {
  storageAvailable = null;
  lastUnavailableLogAt = 0;
};

export const assertSystemLogsStorageAvailable = async (): Promise<void> => {
  if (storageAvailable === true) {
    return;
  }

  const available = await systemRuntimeLogRepository.isTableAvailable();
  if (available) {
    storageAvailable = true;
    return;
  }

  storageAvailable = false;
  const now = Date.now();
  if (now - lastUnavailableLogAt >= UNAVAILABLE_LOG_COOLDOWN_MS) {
    lastUnavailableLogAt = now;
    systemLogger.warn({
      module: "http",
      event: "system-logs.storage.unavailable",
      message: "system_runtime_logs table is not available",
      errorCode: "SYSTEM_LOGS_STORAGE_UNAVAILABLE",
    });
  }

  throw new AppError(
    503,
    "SYSTEM_LOGS_STORAGE_UNAVAILABLE",
    "El almacenamiento de logs del sistema no está disponible. Ejecutá las migraciones pendientes.",
  );
};
