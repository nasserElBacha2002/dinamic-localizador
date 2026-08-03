import { env } from "../config/env";
import { whatsappObservabilityService } from "../services/whatsapp-observability.service";

const JOB_INTERVAL_MS = 6 * 60 * 60 * 1000;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[whatsapp-observability-cleanup] previous run still in progress, skipping tick");
    return;
  }
  if (!env.WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const result = await whatsappObservabilityService.runCleanupBatch();
    if (Object.values(result).some((value) => value > 0)) {
      console.info("[whatsapp-observability-cleanup] tick complete", result);
    }
  } catch (error) {
    console.error("[whatsapp-observability-cleanup] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startWhatsappObservabilityCleanupJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info("[whatsapp-observability-cleanup] starting scheduler (every 6h)");
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopWhatsappObservabilityCleanupJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
