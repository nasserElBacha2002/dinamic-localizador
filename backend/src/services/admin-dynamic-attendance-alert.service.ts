import { adminDynamicAttendanceAlertRepository } from "../repositories/admin-dynamic-attendance-alert.repository";
import type { AdminAlertOutboxObligation } from "../types/admin-alert";
import { minutesBetween } from "../utils/admin-alert/dynamic-attendance-due-at";
import { logAdminAlertEvent } from "../utils/admin-alert/observability";
import { adminAlertService } from "./admin-alert.service";

export type DynamicAttendanceAlertReconcileResult = {
  evaluated: number;
  eligible: number;
  enqueued: number;
  expired: number;
  duplicate: number;
  skippedNoRecipients: number;
  confirmationScanned: number;
  confirmationEnqueued: number;
  missingCheckinScanned: number;
  missingCheckinEnqueued: number;
  missingCheckoutScanned: number;
  missingCheckoutEnqueued: number;
};

const enrichPayloadMinutes = (
  obligation: AdminAlertOutboxObligation,
  referenceAt: Date,
): AdminAlertOutboxObligation => {
  const payload = { ...obligation.payload };
  if ("scheduledStart" in payload && payload.scheduledStart) {
    if (obligation.alertType === "ATTENDANCE_CONFIRMATION_MISSING") {
      payload.minutesUntilStart = minutesBetween(
        referenceAt,
        new Date(payload.scheduledStart),
      );
    }
    if (obligation.alertType === "MISSING_CHECKIN_AFTER_START") {
      payload.minutesLate = minutesBetween(new Date(payload.scheduledStart), referenceAt);
    }
  }
  if (
    obligation.alertType === "MISSING_CHECKOUT_AFTER_END" &&
    "scheduledEnd" in payload &&
    payload.scheduledEnd
  ) {
    payload.minutesLate = minutesBetween(new Date(payload.scheduledEnd), referenceAt);
  }
  return { ...obligation, payload };
};

const materializeObligations = async (
  obligations: AdminAlertOutboxObligation[],
  referenceAt: Date,
): Promise<{
  scanned: number;
  enqueued: number;
  expired: number;
  duplicate: number;
  skippedNoRecipients: number;
}> => {
  let enqueued = 0;
  let expired = 0;
  let duplicate = 0;
  let skippedNoRecipients = 0;

  for (const raw of obligations) {
    const obligation = enrichPayloadMinutes(raw, referenceAt);
    try {
      const result = await adminAlertService.enqueueObligation(obligation);
      if (result.enqueued > 0) {
        if (obligation.enqueueAsExpired) {
          expired += 1;
          logAdminAlertEvent("ADMIN_ALERT_ENQUEUED", {
            companyId: obligation.companyId,
            recipientId: obligation.recipientId,
            alertType: obligation.alertType,
            operationId: obligation.operationId,
            employeeId: obligation.employeeId,
            deduplicationKey: obligation.deduplicationKey,
            reason: "DYNAMIC_ATTENDANCE_EXPIRED",
          });
        } else {
          enqueued += 1;
          logAdminAlertEvent("ADMIN_ALERT_ENQUEUED", {
            companyId: obligation.companyId,
            recipientId: obligation.recipientId,
            alertType: obligation.alertType,
            operationId: obligation.operationId,
            employeeId: obligation.employeeId,
            deduplicationKey: obligation.deduplicationKey,
            reason: "DYNAMIC_ATTENDANCE_DUE",
          });
        }
      } else if (result.dedupSkipped > 0) {
        duplicate += 1;
      } else if (result.recipientSkipped > 0) {
        skippedNoRecipients += 1;
      }
    } catch (error) {
      console.error("[admin-alert] dynamic attendance enqueue failed", {
        companyId: obligation.companyId,
        alertType: obligation.alertType,
        deduplicationKey: obligation.deduplicationKey,
        error: error instanceof Error ? error.message : String(error),
      });
      logAdminAlertEvent("ADMIN_ALERT_FAILED", {
        companyId: obligation.companyId,
        alertType: obligation.alertType,
        deduplicationKey: obligation.deduplicationKey,
        reason: "DYNAMIC_ATTENDANCE_ENQUEUE_FAILED",
      });
    }
  }

  return {
    scanned: obligations.length,
    enqueued,
    expired,
    duplicate,
    skippedNoRecipients,
  };
};

/**
 * Selects due dynamic attendance obligations within max-lateness and enqueues
 * idempotent outbox rows. Also materializes bounded EXPIRED rows for observability.
 * Does not send Twilio (delivery worker does).
 *
 * Temporal source of truth for selection: SQL DATEADD on UTC DateTime2 instants
 * (same semantics as utils/admin-alert/dynamic-attendance-due-at.ts).
 */
export const adminDynamicAttendanceAlertService = {
  async reconcileDue(
    referenceAt: Date = new Date(),
    options?: { batchSize?: number },
  ): Promise<DynamicAttendanceAlertReconcileResult> {
    const batchSize = options?.batchSize ?? 25;

    const confirmation = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listConfirmationMissingObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );
    const missingCheckin = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listMissingCheckinAfterStartObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );
    const missingCheckout = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listMissingCheckoutAfterEndObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );
    const expiredConfirmation = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listExpiredConfirmationMissingObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );
    const expiredCheckin = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listExpiredMissingCheckinAfterStartObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );
    const expiredCheckout = await materializeObligations(
      await adminDynamicAttendanceAlertRepository.listExpiredMissingCheckoutAfterEndObligations(
        referenceAt,
        batchSize,
      ),
      referenceAt,
    );

    const evaluated =
      confirmation.scanned +
      missingCheckin.scanned +
      missingCheckout.scanned +
      expiredConfirmation.scanned +
      expiredCheckin.scanned +
      expiredCheckout.scanned;
    const eligible = confirmation.scanned + missingCheckin.scanned + missingCheckout.scanned;
    const enqueued =
      confirmation.enqueued + missingCheckin.enqueued + missingCheckout.enqueued;
    const expired =
      confirmation.expired +
      missingCheckin.expired +
      missingCheckout.expired +
      expiredConfirmation.expired +
      expiredCheckin.expired +
      expiredCheckout.expired;
    const duplicate =
      confirmation.duplicate +
      missingCheckin.duplicate +
      missingCheckout.duplicate +
      expiredConfirmation.duplicate +
      expiredCheckin.duplicate +
      expiredCheckout.duplicate;
    const skippedNoRecipients =
      confirmation.skippedNoRecipients +
      missingCheckin.skippedNoRecipients +
      missingCheckout.skippedNoRecipients +
      expiredConfirmation.skippedNoRecipients +
      expiredCheckin.skippedNoRecipients +
      expiredCheckout.skippedNoRecipients;

    return {
      evaluated,
      eligible,
      enqueued,
      expired,
      duplicate,
      skippedNoRecipients,
      confirmationScanned: confirmation.scanned,
      confirmationEnqueued: confirmation.enqueued,
      missingCheckinScanned: missingCheckin.scanned,
      missingCheckinEnqueued: missingCheckin.enqueued,
      missingCheckoutScanned: missingCheckout.scanned,
      missingCheckoutEnqueued: missingCheckout.enqueued,
    };
  },
};
