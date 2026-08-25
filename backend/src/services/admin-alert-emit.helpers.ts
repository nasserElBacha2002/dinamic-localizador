import type { AdminAlertEmitInput, AdminAlertEmitResult } from "../types/admin-alert";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { adminAlertService } from "./admin-alert.service";

export type AdminAlertEmitSource =
  | "employee-workday-unavailable"
  | "operation-lifecycle-missing-checkin"
  | "absence-request-pending"
  | "attendance-threshold-crossed";

/**
 * Best-effort emit with explicit error handling (no fire-and-forget).
 *
 * Persistent domain events (UNAVAILABLE, MISSING_CHECKIN, ABSENCE_REQUEST_PENDING)
 * are recovered by adminAlertReconciliationService when enqueue fails after domain commit.
 */
export const emitAdminAlertSafely = async (
  input: AdminAlertEmitInput,
  source: AdminAlertEmitSource,
): Promise<AdminAlertEmitResult | null> => {
  try {
    return await adminAlertService.emit(input);
  } catch (error) {
    console.error("[admin-alert] emit failed", {
      source,
      companyId: input.companyId,
      alertType: input.type,
      deduplicationKey: input.deduplicationKey,
      error: error instanceof Error ? error.message : String(error),
    });
    logAdminAlertEvent("ADMIN_ALERT_FAILED", {
      companyId: input.companyId,
      alertType: input.type,
      deduplicationKey: input.deduplicationKey,
      reason: "EMIT_FAILED",
    });
    return null;
  }
};
