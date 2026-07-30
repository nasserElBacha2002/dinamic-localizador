import type { AbsenceRequestStatus } from "../types/absence";
import type { EmployeeAbsenceAvailabilityStatus } from "../types/absence-operational-impact";

export type AbsenceOperationalEffectPlan = {
  justifyWorkdays: boolean;
  createAssignmentConflicts: boolean;
  revertAppliedEffects: boolean;
};

/**
 * Central matrix: absence status → operational effects.
 */
export const resolveAbsenceOperationalEffectPlan = (
  status: AbsenceRequestStatus | "DRAFT" | "WAITING_DOCUMENTATION",
): AbsenceOperationalEffectPlan => {
  switch (status) {
    case "APPROVED":
      return {
        justifyWorkdays: true,
        createAssignmentConflicts: true,
        revertAppliedEffects: false,
      };
    case "REJECTED":
    case "CANCELLED":
      return {
        justifyWorkdays: false,
        createAssignmentConflicts: false,
        revertAppliedEffects: true,
      };
    default:
      return {
        justifyWorkdays: false,
        createAssignmentConflicts: false,
        revertAppliedEffects: false,
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
