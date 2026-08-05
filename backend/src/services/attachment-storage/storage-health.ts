import { env } from "../../config/env";
import { raceTimeout } from "../../utils/race-timeout";
import { getGcsUnavailableReason, isGcsConfigured } from "./gcs-env";
import { getAttachmentStorage } from "./attachment-storage-provider";

export type StorageComponentStatus = "ok" | "degraded" | "error" | "disabled";

export interface AttachmentStorageHealth {
  status: StorageComponentStatus;
  configured: boolean;
  available: boolean;
  /** Sanitized client-facing message; never includes bucket names, credentials, or SDK dumps. */
  message: string | null;
  durationMs: number;
  checkedAt: string;
}

const sanitizeOperationalMessage = (raw: string | undefined): string => {
  if (!raw) {
    return "Almacenamiento inaccesible";
  }
  const lower = raw.toLowerCase();
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("espera")) {
    return "Tiempo de espera agotado al consultar almacenamiento";
  }
  return "Almacenamiento inaccesible";
};

/**
 * Infrastructure-level GCS/storage probe. Safe for platform diagnostics and company
 * attachment feature checks. Does not belong to the absences domain service.
 */
export async function getAttachmentStorageHealth(
  timeoutMs: number = env.PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS,
): Promise<AttachmentStorageHealth> {
  const started = Date.now();
  const checkedAt = new Date().toISOString();

  if (!isGcsConfigured()) {
    void getGcsUnavailableReason();
    return {
      status: "disabled",
      configured: false,
      available: false,
      message: "Almacenamiento no configurado",
      durationMs: Date.now() - started,
      checkedAt,
    };
  }

  try {
    const raced = await raceTimeout(
      (async () => {
        const storage = getAttachmentStorage();
        return (await storage.checkAccess?.()) ?? { ok: true as const };
      })(),
      timeoutMs,
    );

    if (raced.timedOut) {
      console.error("[storage-health] GCS check timed out", { timeoutMs });
      return {
        status: "error",
        configured: true,
        available: false,
        message: "Tiempo de espera agotado al consultar almacenamiento",
        durationMs: Date.now() - started,
        checkedAt,
      };
    }

    if (!raced.value.ok) {
      console.error("[storage-health] GCS check failed", {
        message: raced.value.message,
      });
      return {
        status: "error",
        configured: true,
        available: false,
        message: sanitizeOperationalMessage(raced.value.message),
        durationMs: Date.now() - started,
        checkedAt,
      };
    }

    return {
      status: "ok",
      configured: true,
      available: true,
      message: null,
      durationMs: Date.now() - started,
      checkedAt,
    };
  } catch (error) {
    console.error("[storage-health] GCS check threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: "error",
      configured: true,
      available: false,
      message: "Almacenamiento inaccesible",
      durationMs: Date.now() - started,
      checkedAt,
    };
  }
}

/** Object probe for tests that mock methods (named export functions are not mockable via mock.method). */
export const attachmentStorageHealthProbe = {
  check: getAttachmentStorageHealth,
};
