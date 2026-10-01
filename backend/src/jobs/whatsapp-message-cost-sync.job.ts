import { env } from "../config/env";
import { whatsappMessageCostReconcileService } from "../services/whatsapp-message-cost-reconcile.service";
import { whatsappMessageCostSyncService } from "../services/whatsapp-message-cost-sync.service";
import { runInstrumentedJobTick } from "../utils/system-logs/job-tick";

let intervalHandle: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Process-local cooldown after an empty reconcile scan.
 * Avoids repeating the outbound anti-join every 60s when there are no gaps.
 * Not a distributed cache — each replica may still run one empty probe per window.
 */
export const COST_RECONCILE_EMPTY_COOLDOWN_MS = 5 * 60_000;
let lastEmptyReconcileAtMs = 0;

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
    await runInstrumentedJobTick({
      module: "message-cost-sync",
      jobName: "message-cost-sync",
      completedEvent: "message-cost-sync.run.completed",
      failedEvent: "message-cost-sync.run.failed",
      completedMessage: "WhatsApp message cost sync tick completed",
      failedMessage: "WhatsApp message cost sync job failed",
      run: async () => {
        const now = Date.now();
        const skipReconcile =
          lastEmptyReconcileAtMs > 0 &&
          now - lastEmptyReconcileAtMs < COST_RECONCILE_EMPTY_COOLDOWN_MS;

        let reconcileFound = 0;
        if (!skipReconcile) {
          const reconcile =
            await whatsappMessageCostReconcileService.reconcileMissingLedgerFromMessages(
              Math.max(env.WHATSAPP_MESSAGE_COST_SYNC_BATCH_SIZE * 2, 20),
            );
          reconcileFound = reconcile.found;
          lastEmptyReconcileAtMs = reconcile.found === 0 ? now : 0;
        }

        const result = await whatsappMessageCostSyncService.processPendingBatch(
          env.WHATSAPP_MESSAGE_COST_SYNC_BATCH_SIZE,
        );
        return {
          reconcileFound,
          reconcileSkipped: skipReconcile,
          processed: result.processed,
          leaseLost: result.leaseLost,
        };
      },
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
