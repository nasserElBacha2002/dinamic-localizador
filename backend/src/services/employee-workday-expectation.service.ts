import { AppError } from "../errors/app-error";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import type { EnsureEmployeeWorkdayOutcome } from "../types/materialization";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";
import { isRecoverableCancelledExpectation } from "../utils/employee-workday-recovery";

const reactivateRecoverableCancelledExpectation = async (
  companyId: string,
  employeeWorkdayId: string,
  operationAssignmentId: string,
): Promise<EmployeeWorkday | null> =>
  employeeWorkdayRepository.reactivateAssignmentCancelledExpectation(
    companyId,
    employeeWorkdayId,
    operationAssignmentId,
  );

export const employeeWorkdayExpectationService = {
  async ensureExpectedForRecurringAssignment(input: {
    companyId: string;
    operationWorkday: OperationWorkday;
    employeeId: string;
    operationAssignmentId: string;
    existing: EmployeeWorkday | undefined;
    hasAttendance: boolean;
  }): Promise<EnsureEmployeeWorkdayOutcome> {
    const { companyId, operationWorkday, employeeId, operationAssignmentId, existing, hasAttendance } =
      input;

    if (existing) {
      const recoverable = await isRecoverableCancelledExpectation(
        companyId,
        existing,
        operationAssignmentId,
        hasAttendance,
      );

      if (recoverable) {
        const reactivated = await reactivateRecoverableCancelledExpectation(
          companyId,
          existing.id,
          operationAssignmentId,
        );
        if (reactivated) {
          return { kind: "REACTIVATED", employeeWorkday: reactivated };
        }

        throw new AppError(
          409,
          "EMPLOYEE_WORKDAY_REACTIVATION_FAILED",
          "No se pudo reactivar la jornada del empleado para la nueva asignación",
        );
      }

      if (existing.operationAssignmentId === operationAssignmentId) {
        if (existing.expectationStatus === "EXPECTED") {
          return { kind: "EXISTING", employeeWorkday: existing };
        }

        if (
          existing.expectationStatus === "CANCELLED" &&
          existing.cancellationReason === "SCHEDULE" &&
          !hasAttendance
        ) {
          const reactivated = await employeeWorkdayRepository.reactivateScheduleCancelledExpectation(
            companyId,
            existing.id,
            operationAssignmentId,
          );
          if (reactivated) {
            return { kind: "REACTIVATED", employeeWorkday: reactivated };
          }
          return { kind: "UNCHANGED", employeeWorkday: existing };
        }

        return { kind: "UNCHANGED", employeeWorkday: existing };
      }

      if (!existing.operationAssignmentId) {
        const repaired = await employeeWorkdayRepository.attachAssignment(
          companyId,
          existing.id,
          operationAssignmentId,
        );
        return { kind: "REPAIRED", employeeWorkday: repaired };
      }

      if (existing.expectationStatus === "EXPECTED") {
        throw new AppError(
          409,
          "EMPLOYEE_WORKDAY_ASSIGNMENT_MISMATCH",
          "La jornada del empleado ya está vinculada a otra asignación",
        );
      }

      return { kind: "UNCHANGED", employeeWorkday: existing };
    }

    try {
      const created = await employeeWorkdayRepository.insert(companyId, {
        operationWorkdayId: operationWorkday.id,
        employeeId,
        operationAssignmentId,
        expectationStatus: "EXPECTED",
      });
      return { kind: "CREATED", employeeWorkday: created };
    } catch (error) {
      if (!employeeWorkdayRepository.isDuplicateKeyError(error)) {
        throw error;
      }
      const raced = await employeeWorkdayRepository.findByWorkdayAndEmployee(
        companyId,
        operationWorkday.id,
        employeeId,
      );
      if (!raced) {
        throw error;
      }
      return this.ensureExpectedForRecurringAssignment({
        ...input,
        existing: raced,
        hasAttendance,
      });
    }
  },
};

export const buildEmployeeWorkdayIndex = (
  employeeWorkdays: EmployeeWorkday[],
): Map<string, Map<string, EmployeeWorkday>> => {
  const index = new Map<string, Map<string, EmployeeWorkday>>();
  for (const employeeWorkday of employeeWorkdays) {
    if (!index.has(employeeWorkday.operationWorkdayId)) {
      index.set(employeeWorkday.operationWorkdayId, new Map());
    }
    index.get(employeeWorkday.operationWorkdayId)!.set(employeeWorkday.employeeId, employeeWorkday);
  }
  return index;
};
