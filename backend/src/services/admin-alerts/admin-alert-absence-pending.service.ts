import {
  buildAbsenceCreatedOperationalDedupKey,
} from "../../utils/admin-alert/dedup-keys";
import { buildAbsenceRequestAdminUrl } from "../../utils/admin-alert/absence-request-admin-url";
import { resolveAbsenceRequestAlertStatusLabel } from "../../utils/admin-alert/absence-request-alert-status";
import { emitAdminAlertSafely } from "./admin-alert-emit.helpers";

export type EmitCreatedAbsenceAdminAlertInput = {
  companyId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  absenceTypeName: string;
  startDate: string;
  endDate: string;
  totalDays?: number | null;
  /** Status immediately after successful creation (PENDING or APPROVED on auto-approve). */
  initialStatus: string;
};

export const adminAlertAbsencePendingService = {
  /**
   * Canonical operational alert for every new absence request (Subfase 2.5).
   * receiveOperationalAlerts + admin_operational_alert template.
   */
  async emitOperationalForCreatedRequest(
    input: EmitCreatedAbsenceAdminAlertInput,
  ): Promise<void> {
    await emitAdminAlertSafely(
      {
        companyId: input.companyId,
        type: "ABSENCE_REQUEST_PENDING",
        category: "OPERATIONAL",
        severity: "INFO",
        employeeId: input.employeeId,
        absenceRequestId: input.requestId,
        deduplicationKey: buildAbsenceCreatedOperationalDedupKey(input.requestId),
        occurredAt: new Date(),
        payload: {
          employeeName: input.employeeName,
          absenceTypeName: input.absenceTypeName,
          absenceStartDate: input.startDate,
          absenceEndDate: input.endDate,
          absenceTotalDays: input.totalDays ?? null,
          absenceStatusLabel: resolveAbsenceRequestAlertStatusLabel(input.initialStatus),
          absenceDetailUrl: buildAbsenceRequestAdminUrl(input.requestId),
        },
      },
      "absence-request-created-operational",
    );
  },
};
