import type { AdminAlertEmitInput, AdminAlertEmitResult } from "../types/admin-alert";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { adminAlertService } from "./admin-alert.service";

export type AdminAlertEmitSource =
  | "employee-workday-unavailable"
  | "operation-lifecycle-missing-checkin"
  | "whatsapp-forwarded-location"
  | "absence-request-pending"
  | "attendance-threshold-crossed";

/**
 * Best-effort emit with explicit error handling (no fire-and-forget).
 *
 * Persistent domain events (UNAVAILABLE, MISSING_CHECKIN, ABSENCE_REQUEST_PENDING)
 * are recovered by adminAlertReconciliationService when enqueue fails after domain commit.
 *
 * FORWARDED_LOCATION_REJECTED — best-effort security alert:
 * Dedup is MessageSid-bound. Inbound webhook claim is the primary idempotency layer.
 * Emit failure must not unblock attendance; the employee rejection still stands.
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
      ...(source === "whatsapp-forwarded-location"
        ? { limitation: "FORWARDED_LOCATION_BEST_EFFORT" }
        : {}),
    });
    logAdminAlertEvent("ADMIN_ALERT_FAILED", {
      companyId: input.companyId,
      alertType: input.type,
      deduplicationKey: input.deduplicationKey,
      reason:
        source === "whatsapp-forwarded-location" ? "EMIT_FAILED_BEST_EFFORT" : "EMIT_FAILED",
    });
    return null;
  }
};
