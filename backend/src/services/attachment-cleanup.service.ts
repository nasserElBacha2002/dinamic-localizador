import { env } from "../config/env";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import { absenceAttachmentMetrics } from "../utils/absence-attachments/metrics";
import { getAttachmentStorage, isGcsConfigured } from "./attachment-storage";

export const attachmentCleanupService = {
  async processCleanupBatch(limit = 25): Promise<{
    processed: number;
    deleted: number;
    failed: number;
  }> {
    if (!isGcsConfigured()) {
      return { processed: 0, deleted: 0, failed: 0 };
    }
    const ttl = env.ABSENCE_ATTACHMENT_PENDING_TTL_MINUTES;
    const leaseOwner = `cleanup-${process.pid}-${Date.now()}`;
    let processed = 0;
    let deleted = 0;
    let failed = 0;
    const storage = getAttachmentStorage();

    for (let i = 0; i < limit; i += 1) {
      const row = await absenceAttachmentRepository.claimNextForCleanup({
        olderThanMinutes: ttl,
        leaseOwner,
        leaseSeconds: 120,
        maxAttempts: 10,
      });
      if (!row) {
        break;
      }
      processed += 1;
      try {
        if (row.status === "PENDING_DELETE" || row.status === "FAILED") {
          const exists = await storage.objectExists({
            objectKey: row.objectKey,
            generation: row.objectGeneration ?? undefined,
          });
          if (exists) {
            await storage.deleteObject({
              objectKey: row.objectKey,
              generation: row.objectGeneration ?? undefined,
            });
          }
          await absenceAttachmentRepository.markStatus(
            row.companyId,
            row.id,
            "DELETED",
            { deletionReason: "cleanup_job", incrementAttempt: true },
          );
          deleted += 1;
        } else {
          const exists = await storage.objectExists({ objectKey: row.objectKey });
          if (exists) {
            await storage.deleteObject({ objectKey: row.objectKey });
            absenceAttachmentMetrics.orphanDetected({
              operation: "cleanup",
              status: row.status,
            });
          }
          await absenceAttachmentRepository.markFailed(
            row.companyId,
            row.id,
            "Abandoned upload cleaned by job",
          );
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        await absenceAttachmentRepository.markStatus(row.companyId, row.id, row.status, {
          lastError: error instanceof Error ? error.message : String(error),
          incrementAttempt: true,
        });
        absenceAttachmentMetrics.deleteFailed({
          operation: "cleanup",
          status: row.status,
        });
      }
    }

    return { processed, deleted, failed };
  },
};
