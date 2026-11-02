import {
  buildAbsenceUpdatedOperationalDedupKey,
} from "../../utils/admin-alert/dedup-keys";
import { buildAbsenceRequestAdminUrl } from "../../utils/admin-alert/absence-request-admin-url";
import { formatAbsenceRequestPeriodDisplay } from "../../utils/admin-alert/request-template-variables";
import { emitAdminAlertSafely } from "./admin-alert-emit.helpers";

export type EmitUpdatedAbsenceAdminAlertInput = {
  companyId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  absenceTypeName: string;
  previousStartDate: string;
  previousEndDate: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  sourceMessageSid: string;
  conversationId?: string | null;
};

export const adminAlertAbsenceUpdatedService = {
  async emitOperationalForUpdatedRequest(input: EmitUpdatedAbsenceAdminAlertInput): Promise<void> {
    const previousPeriod = formatAbsenceRequestPeriodDisplay(
      input.previousStartDate,
      input.previousEndDate,
    );
    const nextPeriod = formatAbsenceRequestPeriodDisplay(input.startDate, input.endDate);
    await emitAdminAlertSafely(
      {
        companyId: input.companyId,
        type: "ABSENCE_REQUEST_PENDING",
        category: "OPERATIONAL",
        severity: "WARNING",
        employeeId: input.employeeId,
        absenceRequestId: input.requestId,
        deduplicationKey: buildAbsenceUpdatedOperationalDedupKey(
          input.requestId,
          input.sourceMessageSid,
        ),
        occurredAt: new Date(),
        payload: {
          employeeName: input.employeeName,
          absenceTypeName: input.absenceTypeName,
          absenceStartDate: input.startDate,
          absenceEndDate: input.endDate,
          absenceTotalDays: input.totalDays,
          absenceStatusLabel: `${input.employeeName} modificó su solicitud · antes ${previousPeriod} · ahora ${nextPeriod}`,
          absenceDetailUrl: buildAbsenceRequestAdminUrl(input.requestId),
        },
      },
      "absence-request-created-operational",
    );
  },

  /** Idempotent heal when WhatsApp edit persisted but post-commit admin emit failed. */
  async ensureOperationalForUpdatedRequest(input: EmitUpdatedAbsenceAdminAlertInput): Promise<void> {
    await this.emitOperationalForUpdatedRequest(input);
  },
};
