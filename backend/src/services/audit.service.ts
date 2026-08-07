import type sql from "mssql";
import { auditRepository } from "../repositories/audit.repository";
import { sanitizeAuditPayload } from "../utils/audit-sanitize";

export const auditService = {
  /**
   * Persist an audit_logs row. When `transaction` is provided, the insert joins the
   * caller's unit of work (CRITICAL_AUDIT). Without it, callers own best-effort semantics
   * (e.g. logAuditSafe) — this method never swallows insert failures.
   */
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
    transaction?: sql.Transaction,
  ): Promise<void> {
    const previousData = sanitizeAuditPayload(input.previousData ?? null);
    const newData = sanitizeAuditPayload(input.newData ?? null);

    await auditRepository.log(
      {
        companyId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        previousData: previousData ? JSON.stringify(previousData) : null,
        newData: newData ? JSON.stringify(newData) : null,
        reason: input.reason ?? null,
        userId: input.userId ?? null,
      },
      transaction,
    );
  },
};
