import type { AbsenceRequestStatus } from "../types/absence";
import type { EmployeeAbsenceAvailabilityStatus } from "../types/absence-operational-impact";

export type AbsenceOperationalEffectPlan = {
  justifyWorkdays: boolean;
  provisionalWarning: boolean;
  clearProvisional: boolean;
  revertAppliedEffects: boolean;
  createAssignmentConflicts: boolean;
};

/**
 * Central matrix: absence status → operational effects.
 * Controllers/hooks must not invent alternate rules.
 */
export const resolveAbsenceOperationalEffectPlan = (
  status: AbsenceRequestStatus | "DRAFT" | "WAITING_DOCUMENTATION",
): AbsenceOperationalEffectPlan => {
  switch (status) {
    case "DRAFT":
    case "WAITING_DOCUMENTATION":
      return {
        justifyWorkdays: false,
        provisionalWarning: false,
        clearProvisional: false,
        revertAppliedEffects: false,
        createAssignmentConflicts: false,
      };
    case "PENDING":
    case "NEEDS_INFO":
      return {
        justifyWorkdays: false,
        provisionalWarning: true,
        clearProvisional: false,
        revertAppliedEffects: false,
        createAssignmentConflicts: false,
      };
    case "APPROVED":
      return {
        justifyWorkdays: true,
        provisionalWarning: false,
        clearProvisional: true,
        revertAppliedEffects: false,
        createAssignmentConflicts: true,
      };
    case "REJECTED":
      return {
        justifyWorkdays: false,
        provisionalWarning: false,
        clearProvisional: true,
        revertAppliedEffects: true,
        createAssignmentConflicts: false,
      };
    case "CANCELLED":
      return {
        justifyWorkdays: false,
        provisionalWarning: false,
        clearProvisional: true,
        revertAppliedEffects: true,
        createAssignmentConflicts: false,
      };
    default:
      return {
        justifyWorkdays: false,
        provisionalWarning: false,
        clearProvisional: false,
        revertAppliedEffects: false,
        createAssignmentConflicts: false,
      };
  }
};

export const resolveEmployeeAbsenceAvailabilityStatus = (input: {
  employeeActive: boolean;
  hasApprovedCovering: boolean;
  hasPendingOrNeedsInfoCovering: boolean;
  hasPartialDayCovering: boolean;
}): EmployeeAbsenceAvailabilityStatus => {
  if (!input.employeeActive) {
    return "UNAVAILABLE";
  }
  if (input.hasApprovedCovering && input.hasPartialDayCovering) {
    return "PARTIALLY_UNAVAILABLE";
  }
  if (input.hasApprovedCovering) {
    return "UNAVAILABLE";
  }
  if (input.hasPendingOrNeedsInfoCovering) {
    return "PROVISIONALLY_UNAVAILABLE";
  }
  return "AVAILABLE";
};
