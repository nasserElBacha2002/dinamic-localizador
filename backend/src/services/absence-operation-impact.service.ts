import { absenceOperationalConflictService } from "./absence-operational-conflict.service";
import { absenceOperationalImpactQueryService } from "./absence-operational-impact-query.service";
import { absenceOperationalReconciliationService } from "./absence-operational-reconciliation.service";

/**
 * Facade preserving previous import sites while responsibilities live in split services.
 */
export const absenceOperationImpactService = {
  isFeatureEnabled: (companyId: string) =>
    absenceOperationalImpactQueryService.isFeatureEnabled(companyId),
  getOperationTimezone: (companyId: string) =>
    absenceOperationalImpactQueryService.getOperationTimezone(companyId),
  findAffectedOperations: (
    companyId: string,
    input: { employeeId: string; startDate: string; endDate: string },
    timezone?: string,
  ) => absenceOperationalImpactQueryService.findAffectedOperations(companyId, input, timezone),
  countAffectedOperationsForList: (
    companyId: string,
    items: Array<{ id: string; employeeId: string; startDate: string; endDate: string }>,
  ) => absenceOperationalImpactQueryService.countAffectedOperationsForList(companyId, items),
  computeImpact: (companyId: string, absenceRequestId: string) =>
    absenceOperationalImpactQueryService.computeImpact(companyId, absenceRequestId),
  applyApprovedOperationalSideEffects: (companyId: string, absenceRequestId: string) =>
    absenceOperationalReconciliationService.applyApprovedOperationalSideEffects(
      companyId,
      absenceRequestId,
    ),
  revertOperationalSideEffects: (
    companyId: string,
    absenceRequestId: string,
    reason: string,
  ) =>
    absenceOperationalReconciliationService.revertOperationalSideEffects(
      companyId,
      absenceRequestId,
      reason,
    ),
  resolveConflict: (
    companyId: string,
    absenceRequestId: string,
    conflictId: string,
    input: Parameters<typeof absenceOperationalConflictService.resolveConflict>[3],
  ) =>
    absenceOperationalConflictService.resolveConflict(
      companyId,
      absenceRequestId,
      conflictId,
      input,
    ),
  reconcileManually: (
    companyId: string,
    absenceRequestId: string,
    userId: string,
    commandId: string,
  ) =>
    absenceOperationalReconciliationService.enqueueManualReconcile(
      companyId,
      absenceRequestId,
      userId,
      commandId,
    ),
};
