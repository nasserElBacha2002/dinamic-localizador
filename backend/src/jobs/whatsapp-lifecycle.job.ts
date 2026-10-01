import { env } from "../config/env";
import { whatsappLifecycleService } from "../services/whatsapp-lifecycle.service";

const JOB_INTERVAL_MS = env.WHATSAPP_LIFECYCLE_JOB_INTERVAL_MS;

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[whatsapp-lifecycle] previous run still in progress, skipping tick");
    return;
  }
  if (!env.WHATSAPP_LIFECYCLE_JOB_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    await whatsappLifecycleService.runReconcile();
  } catch (error) {
    console.error("[whatsapp-lifecycle] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startWhatsappLifecycleJob = (): void => {
  if (intervalHandle) {
    return;
  }
  console.info(
    `[whatsapp-lifecycle] starting scheduler (every ${JOB_INTERVAL_MS}ms, idleHours=${env.WHATSAPP_CONVERSATION_IDLE_TIMEOUT_HOURS}, flowTimeoutHours=${env.WHATSAPP_FLOW_STARTED_TIMEOUT_HOURS}, dryRun=${env.WHATSAPP_LIFECYCLE_DRY_RUN})`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, JOB_INTERVAL_MS);
};

export const stopWhatsappLifecycleJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runWhatsappLifecycleOnce = runJobSafely;
