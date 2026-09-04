import { env } from "../config/env";
import { whatsappRetentionService } from "../services/whatsapp-retention.service";

const JOB_INTERVAL_MS = env.WHATSAPP_RETENTION_CLEANUP_INTERVAL_MS;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[whatsapp-retention-cleanup] previous run still in progress, skipping tick");
    return;
  }
  if (!env.WHATSAPP_RETENTION_CLEANUP_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    await whatsappRetentionService.runCleanup();
  } catch (error) {
    console.error("[whatsapp-retention-cleanup] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startWhatsappRetentionCleanupJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info(
    `[whatsapp-retention-cleanup] starting scheduler (every ${JOB_INTERVAL_MS}ms, retentionDays=${env.WHATSAPP_RETENTION_DAYS}, dryRun=${env.WHATSAPP_RETENTION_DRY_RUN})`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopWhatsappRetentionCleanupJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

/** Test hook / manual invocation from scheduler tick. */
export const runWhatsappRetentionCleanupOnce = runJobSafely;
