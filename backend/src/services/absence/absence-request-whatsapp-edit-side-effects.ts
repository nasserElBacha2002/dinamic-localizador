import { AppError } from "../../errors/app-error";
import { absenceOperationalImpactRepository } from "../../repositories/absence/absence-operational-impact.repository";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { adminAlertAbsenceUpdatedService } from "../admin-alerts/admin-alert-absence-updated.service";

export type EnsureWhatsappEditSideEffectsInput = {
  companyId: string;
  requestId: string;
  sourceMessageSid: string;
  conversationId?: string | null;
  previousStartDate: string;
  previousEndDate: string;
};

/**
 * Post-commit obligations for a WhatsApp edit (operational impact + admin alert).
 * Safe to re-run on idempotent retries after the edit marker event exists.
 */
export const ensureWhatsappEditPostCommitSideEffects = async (
  input: EnsureWhatsappEditSideEffectsInput,
): Promise<void> => {
  await absenceOperationalImpactRepository.bumpOperationalImpactVersion(
    input.companyId,
    input.requestId,
  );

  const row = await absenceRequestRepository.findDetailById(input.companyId, input.requestId);
  if (!row) {
    throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
  }

  await adminAlertAbsenceUpdatedService.ensureOperationalForUpdatedRequest({
    companyId: input.companyId,
    requestId: input.requestId,
    employeeId: row.employeeId,
    employeeName: row.employee.name,
    absenceTypeName: row.absenceType.name,
    previousStartDate: input.previousStartDate,
    previousEndDate: input.previousEndDate,
    startDate: row.startDate,
    endDate: row.endDate,
    totalDays: row.totalDays,
    sourceMessageSid: input.sourceMessageSid,
    conversationId: input.conversationId ?? null,
  });
};

export const resolveWhatsappEditPreviousDates = async (
  companyId: string,
  requestId: string,
  sourceMessageSid: string,
  fallbackStartDate: string,
  fallbackEndDate: string,
): Promise<{ previousStartDate: string; previousEndDate: string }> => {
  const fromAudit = await absenceRequestRepository.findWhatsappEditAuditContext(
    companyId,
    requestId,
    sourceMessageSid,
  );
  if (fromAudit) {
    return fromAudit;
  }
  return { previousStartDate: fallbackStartDate, previousEndDate: fallbackEndDate };
};
