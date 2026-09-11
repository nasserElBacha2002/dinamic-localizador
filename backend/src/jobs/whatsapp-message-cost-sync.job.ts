import { env } from "../config/env";
import { whatsappMessageCostReconcileService } from "../services/whatsapp-message-cost-reconcile.service";
import { whatsappMessageCostSyncService } from "../services/whatsapp-message-cost-sync.service";
import { systemLogger } from "../utils/system-logs/logger";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

const runJobSafely = async (): Promise<void> => {
  if (isRunning) {
    console.info("[whatsapp-message-cost-sync-job] previous run still in progress, skipping tick");
    return;
  }
  if (!env.WHATSAPP_MESSAGE_COST_SYNC_WORKER_ENABLED) {
    return;
  }

  isRunning = true;
  try {
    const reconcile = await whatsappMessageCostReconcileService.reconcileMissingLedgerFromMessages(
      Math.max(env.WHATSAPP_MESSAGE_COST_SYNC_BATCH_SIZE * 2, 20),
    );
    if (reconcile.found > 0) {
      console.info("[whatsapp-message-cost-sync-job] reconcile", reconcile);
    }

    const result = await whatsappMessageCostSyncService.processPendingBatch(
      env.WHATSAPP_MESSAGE_COST_SYNC_BATCH_SIZE,
    );
    if (result.processed > 0 || result.leaseLost > 0) {
      console.info("[whatsapp-message-cost-sync-job] tick complete", result);
    }
  } catch (error) {
    systemLogger.error({
      module: "message-cost-sync",
      event: "message-cost-sync.run.failed",
      message: "WhatsApp message cost sync job failed",
      error,
    });
    console.error("[whatsapp-message-cost-sync-job] unexpected job error", {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isRunning = false;
  }
};

export const startWhatsappMessageCostSyncJob = (): void => {
  if (intervalHandle) {
    return;
  }
  if (!env.WHATSAPP_MESSAGE_COST_SYNC_WORKER_ENABLED) {
    console.info("[whatsapp-message-cost-sync-job] disabled by env");
    return;
  }
  console.info(
    `[whatsapp-message-cost-sync-job] starting scheduler (every ${env.WHATSAPP_MESSAGE_COST_SYNC_WORKER_INTERVAL_MS}ms)`,
  );
  void runJobSafely();
  intervalHandle = setInterval(() => {
    void runJobSafely();
  }, env.WHATSAPP_MESSAGE_COST_SYNC_WORKER_INTERVAL_MS);
};

export const stopWhatsappMessageCostSyncJob = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};

export const runWhatsappMessageCostSyncJobOnce = async (): Promise<void> => {
  await runJobSafely();
};
