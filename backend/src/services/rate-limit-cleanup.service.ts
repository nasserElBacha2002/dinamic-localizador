import { env } from "../config/env";
import { RATE_LIMIT_CLEANUP_LOCK_RESOURCE } from "../constants/rate-limit-cleanup";
import { getRateLimitStore } from "../middleware/rate-limit";
import { withDedicatedSessionAppLock } from "../utils/whatsapp-retention-lock";

export const rateLimitCleanupService = {
  /**
   * Bounded, idempotent cleanup of expired rate-limit buckets.
   * Cross-replica fencing via session app lock (no process-local isRunning).
   */
  async runCleanup(): Promise<{
    deleted: number;
    batches: number;
    lockSkipped: boolean;
  }> {
    if (!env.RATE_LIMIT_CLEANUP_JOB_ENABLED) {
      return { deleted: 0, batches: 0, lockSkipped: false };
    }

    const lockResult = await withDedicatedSessionAppLock(
      RATE_LIMIT_CLEANUP_LOCK_RESOURCE,
      async () => {
        const store = getRateLimitStore();
        const deleteBatch = store.deleteExpiredBatch?.bind(store);
        if (!deleteBatch) {
          return { deleted: 0, batches: 0 };
        }

        let deleted = 0;
        let batches = 0;
        const maxBatches = 50;
        const batchSize = env.RATE_LIMIT_CLEANUP_BATCH_SIZE;

        while (batches < maxBatches) {
          const n = await deleteBatch(batchSize);
          batches += 1;
          deleted += n;
          if (n < batchSize) {
            break;
          }
        }

        return { deleted, batches };
      },
      { lockTimeoutMs: 0 },
    );

    if (lockResult.outcome === "skipped") {
      return { deleted: 0, batches: 0, lockSkipped: true };
    }
    return { ...lockResult.value, lockSkipped: false };
  },
};
