import { ABSENCE_REQUEST_PENDING_STATUS_LABEL } from "../constants/admin-alert";
import { buildAbsencePendingDedupKey } from "../utils/admin-alert/dedup-keys";
import { emitAdminAlertSafely } from "./admin-alert-emit.helpers";

export type EmitPendingAbsenceAdminAlertInput = {
  companyId: string;
  requestId: string;
  employeeId: string;
  employeeName: string;
  absenceTypeName: string;
  startDate: string;
  endDate: string;
};

export const adminAlertAbsencePendingService = {
  async emitForPendingWhatsappRequest(
    input: EmitPendingAbsenceAdminAlertInput,
  ): Promise<void> {
    await emitAdminAlertSafely(
      {
        companyId: input.companyId,
        type: "ABSENCE_REQUEST_PENDING",
        category: "REQUEST",
        severity: "INFO",
        employeeId: input.employeeId,
        absenceRequestId: input.requestId,
        deduplicationKey: buildAbsencePendingDedupKey(input.requestId),
        occurredAt: new Date(),
        payload: {
          employeeName: input.employeeName,
          absenceTypeName: input.absenceTypeName,
          startDate: input.startDate,
          endDate: input.endDate,
          statusLabel: ABSENCE_REQUEST_PENDING_STATUS_LABEL,
        },
      },
      "absence-request-pending",
    );
  },
};
