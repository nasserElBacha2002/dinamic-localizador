import { platformAuditRepository } from "../repositories/platform-audit.repository";
import { auditService } from "./audit.service";

/**
 * Platform-scoped audit (no tenant company). Falls back to tenant audit_logs
 * when a companyId is available so existing company-scoped trails remain intact.
 */
export const platformAuditService = {
  async logSystemLogAccess(input: {
    companyId: string | null;
    userId: string;
    entityId: string;
    action: string;
  }): Promise<void> {
    if (input.companyId) {
      await auditService.log(input.companyId, {
        entityType: "system_runtime_log",
        entityId: input.entityId,
        action: input.action,
        userId: input.userId,
        newData: { action: input.action },
      });
      return;
    }

    await platformAuditRepository.log({
      userId: input.userId,
      action: input.action,
      entityType: "system_runtime_log",
      entityId: input.entityId,
      result: "SUCCESS",
    });
  },
};
