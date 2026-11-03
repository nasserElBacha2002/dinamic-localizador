import { adminAlertContextRepository } from "../../repositories/admin-alerts/admin-alert-context.repository";
import type { AdminAlertOutboxObligation } from "../../types/admin-alert";
import { logAdminAlertEvent } from "../../utils/admin-alert/observability";
import { adminAlertService } from "./admin-alert.service";

export type AdminAlertReconciliationResult = {
  unavailableScanned: number;
  unavailableRecovered: number;
  missingCheckinScanned: number;
  missingCheckinRecovered: number;
  pendingAbsenceScanned: number;
  pendingAbsenceRecovered: number;
};

const absenceRecipientCoverageKey = (
  obligation: Pick<AdminAlertOutboxObligation, "companyId" | "recipientId" | "absenceRequestId">,
): string =>
  `${obligation.companyId.trim().toLowerCase()}:${obligation.recipientId.trim().toLowerCase()}:${(obligation.absenceRequestId ?? "").trim().toLowerCase()}`;

/**
 * Dual-toggle recipients must not receive both admin_request_alert and
 * admin_operational_alert for the same absence. REQUEST is only a fallback
 * for request-only recipients; OPERATIONAL is canonical when both exist.
 */
const dropRequestCoveredByOperational = (
  requestObligations: AdminAlertOutboxObligation[],
  operationalObligations: AdminAlertOutboxObligation[],
): AdminAlertOutboxObligation[] => {
  const covered = new Set(operationalObligations.map(absenceRecipientCoverageKey));
  return requestObligations.filter(
    (obligation) => !covered.has(absenceRecipientCoverageKey(obligation)),
  );
};

const materializeObligations = async (
  obligations: AdminAlertOutboxObligation[],
): Promise<{ scanned: number; recovered: number }> => {
  let recovered = 0;

  for (const obligation of obligations) {
    try {
      const result = await adminAlertService.enqueueObligation(obligation);
      if (result.enqueued > 0) {
        recovered += 1;
        logAdminAlertEvent("ADMIN_ALERT_ENQUEUED", {
          companyId: obligation.companyId,
          recipientId: obligation.recipientId,
          alertType: obligation.alertType,
          absenceRequestId: obligation.absenceRequestId,
          deduplicationKey: obligation.deduplicationKey,
          reason: "RECONCILIATION_RECOVERED",
        });
      }
    } catch (error) {
      console.error("[admin-alert] reconciliation enqueue failed", {
        companyId: obligation.companyId,
        recipientId: obligation.recipientId,
        alertType: obligation.alertType,
        deduplicationKey: obligation.deduplicationKey,
        error: error instanceof Error ? error.message : String(error),
      });
      logAdminAlertEvent("ADMIN_ALERT_FAILED", {
        companyId: obligation.companyId,
        recipientId: obligation.recipientId,
        alertType: obligation.alertType,
        deduplicationKey: obligation.deduplicationKey,
        reason: "RECONCILIATION_ENQUEUE_FAILED",
      });
    }
  }

  return { scanned: obligations.length, recovered };
};

/**
 * Idempotent reconciler: materializes missing event×recipient outbox rows.
 * Queries already anti-join outbox and filter by admin_alerts_enabled_at +
 * recipient.created_at <= event.occurred_at, so cost ≈ pending obligations.
 */
export const adminAlertReconciliationService = {
  async reconcileUnavailable(batchSize = 50): Promise<{ scanned: number; recovered: number }> {
    const obligations =
      await adminAlertContextRepository.listMissingUnavailableObligations(batchSize);
    return materializeObligations(obligations);
  },

  async reconcileMissingCheckin(batchSize = 50): Promise<{ scanned: number; recovered: number }> {
    // Legacy MISSING_CHECKIN_AFTER_OPERATION WhatsApp recovery disabled.
    // Dynamic MISSING_CHECKIN_AFTER_START is handled by adminDynamicAttendanceAlertService.
    void batchSize;
    return { scanned: 0, recovered: 0 };
  },

  async reconcilePendingAbsenceRequests(
    batchSize = 50,
  ): Promise<{ scanned: number; recovered: number }> {
    const [requestObligations, operationalObligations, updatedOperationalObligations] =
      await Promise.all([
        adminAlertContextRepository.listMissingPendingAbsenceObligations(batchSize),
        adminAlertContextRepository.listMissingCreatedAbsenceOperationalObligations(batchSize),
        adminAlertContextRepository.listMissingUpdatedAbsenceOperationalObligations(batchSize),
      ]);
    return materializeObligations([
      ...operationalObligations,
      ...updatedOperationalObligations,
      ...dropRequestCoveredByOperational(requestObligations, operationalObligations),
    ]);
  },

  async reconcileAll(options?: {
    unavailableBatchSize?: number;
    missingCheckinBatchSize?: number;
    pendingAbsenceBatchSize?: number;
  }): Promise<AdminAlertReconciliationResult> {
    const unavailable = await this.reconcileUnavailable(options?.unavailableBatchSize ?? 50);
    const missingCheckin = await this.reconcileMissingCheckin(
      options?.missingCheckinBatchSize ?? 50,
    );
    const pendingAbsence = await this.reconcilePendingAbsenceRequests(
      options?.pendingAbsenceBatchSize ?? 50,
    );

    return {
      unavailableScanned: unavailable.scanned,
      unavailableRecovered: unavailable.recovered,
      missingCheckinScanned: missingCheckin.scanned,
      missingCheckinRecovered: missingCheckin.recovered,
      pendingAbsenceScanned: pendingAbsence.scanned,
      pendingAbsenceRecovered: pendingAbsence.recovered,
    };
  },
};
