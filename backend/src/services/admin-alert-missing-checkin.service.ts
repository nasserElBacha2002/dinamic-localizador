/**
 * @deprecated Prefer markMissingCheckinEmployeesDirtyForThreshold.
 * Kept as a thin adapter so existing imports keep compiling during rollout.
 * Does not enqueue WhatsApp for MISSING_CHECKIN_AFTER_OPERATION.
 */
import type { Operation } from "../types/domain";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { markMissingCheckinEmployeesDirtyForThreshold } from "./attendance-threshold-completed-operation.service";

export const adminAlertMissingCheckinService = {
  async emitForCompletedOperation(companyId: string, operation: Operation): Promise<void> {
    if (operation.status !== "COMPLETED" || operation.operationKind !== "ONE_TIME") {
      return;
    }

    logAdminAlertEvent("ADMIN_ALERT_RECIPIENT_SKIPPED", {
      companyId,
      alertType: "MISSING_CHECKIN_AFTER_OPERATION",
      operationId: operation.id,
      reason: "LEGACY_WHATSAPP_DISABLED_USE_MISSING_CHECKIN_AFTER_START",
    });

    await markMissingCheckinEmployeesDirtyForThreshold(companyId, operation.id);
  },
};
