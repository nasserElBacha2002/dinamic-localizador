import { auditRepository } from "../repositories/audit.repository";

export const auditService = {
  async log(
    companyId: string,
    input: {
      entityType: string;
      entityId: string;
      action: string;
      previousData?: Record<string, unknown> | null;
      newData?: Record<string, unknown> | null;
      reason?: string | null;
      userId?: string | null;
    },
  ): Promise<void> {
    await auditRepository.log({
      companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      previousData: input.previousData ? JSON.stringify(input.previousData) : null,
      newData: input.newData ? JSON.stringify(input.newData) : null,
      reason: input.reason ?? null,
      userId: input.userId ?? null,
    });
  },
};
