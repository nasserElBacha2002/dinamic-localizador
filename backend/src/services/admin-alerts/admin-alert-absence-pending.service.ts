import type { AbsenceRequestDetail } from "../../types/absence";
import type { AdminAlertEmitResult } from "../../types/admin-alert";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import {
  buildAbsenceCreatedOperationalDedupKey,
} from "../../utils/admin-alert/dedup-keys";
import { buildAbsenceRequestAdminUrl } from "../../utils/admin-alert/absence-request-admin-url";
import { resolveAbsenceRequestAlertStatusLabel } from "../../utils/admin-alert/absence-request-alert-status";
import { logAdminAlertEvent } from "../../utils/admin-alert/observability";
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
  conversationId?: string | null;
};

const resolveEmitOutcome = (result: AdminAlertEmitResult | null): string => {
  if (result === null) {
    return "EMIT_FAILED";
  }
  if (result.enqueued > 0) {
    return "ENQUEUED";
  }
  if (result.dedupSkipped > 0) {
    return "DEDUP_SKIPPED";
  }
  if (result.recipientSkipped > 0) {
    return "NO_RECIPIENTS_OR_RECIPIENT_SKIPPED";
  }
  return "CHANNEL_SUPPRESSED_OR_EMPTY";
};

const logCreatedRequestAdminAlertEmit = async (
  input: EmitCreatedAbsenceAdminAlertInput,
  result: AdminAlertEmitResult | null,
): Promise<void> => {
  const settings = await companySettingsRepository.findByCompanyId(input.companyId);
  logAdminAlertEvent("ABSENCE_REQUEST_ADMIN_ALERT_EMIT", {
    companyId: input.companyId,
    absenceRequestId: input.requestId,
    alertType: "ABSENCE_REQUEST_PENDING",
    category: "OPERATIONAL",
    mode: settings?.adminAlertDeliveryMode ?? "WHATSAPP_LEGACY",
    conversationId: input.conversationId ?? null,
    enqueuedCount: result?.enqueued ?? 0,
    dedupSkippedCount: result?.dedupSkipped ?? 0,
    recipientSkippedCount: result?.recipientSkipped ?? 0,
    emitOutcome: resolveEmitOutcome(result),
  });
};

export const adminAlertAbsencePendingService = {
  /**
   * Canonical operational alert for every new absence request (Subfase 2.5).
   * receiveOperationalAlerts + admin_operational_alert template.
   */
  async emitOperationalForCreatedRequest(
    input: EmitCreatedAbsenceAdminAlertInput,
  ): Promise<AdminAlertEmitResult | null> {
    const result = await emitAdminAlertSafely(
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
    await logCreatedRequestAdminAlertEmit(input, result);
    return result;
  },

  /**
   * Idempotent heal when WhatsApp retries after the request was persisted but admin emit did not outbox.
   */
  async ensureOperationalForExistingRequest(
    companyId: string,
    detail: AbsenceRequestDetail,
    options?: { conversationId?: string | null },
  ): Promise<void> {
    await this.emitOperationalForCreatedRequest({
      companyId,
      requestId: detail.id,
      employeeId: detail.employeeId,
      employeeName: detail.employee.name,
      absenceTypeName: detail.absenceType.name,
      startDate: detail.startDate,
      endDate: detail.endDate,
      totalDays: detail.totalDays,
      initialStatus: detail.status,
      conversationId: options?.conversationId ?? null,
    });
  },
};
