import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import type { EmployeeWorkday } from "../types/workday";

/**
 * Determines whether a cancelled employee_workday can be safely reactivated
 * for a new active assignment during reassignment or materialization.
 */
export async function isRecoverableCancelledExpectation(
  companyId: string,
  existing: EmployeeWorkday,
  operationAssignmentId: string,
  hasAttendance: boolean,
): Promise<boolean> {
  if (existing.expectationStatus !== "CANCELLED") {
    return false;
  }

  if (hasAttendance) {
    return false;
  }

  if (existing.cancellationReason === "SCHEDULE") {
    return false;
  }

  if (
    existing.cancellationReason !== "ASSIGNMENT" &&
    existing.cancellationReason !== null
  ) {
    return false;
  }

  if (!existing.operationAssignmentId) {
    return true;
  }

  if (existing.operationAssignmentId === operationAssignmentId) {
    return true;
  }

  const linkedAssignment = await operationEmployeeRepository.findById(
    companyId,
    existing.operationAssignmentId,
  );

  if (!linkedAssignment) {
    return true;
  }

  return Boolean(linkedAssignment.cancelledAt);
}
