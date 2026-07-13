import sql from "mssql";
import { AppError } from "../errors/app-error";
import type { WorkTeamAssignmentSkipReason } from "../constants/work-team-assignment";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import {
  assertValidAssignmentDateRange,
  assignmentPeriodsOverlap,
  isAssignmentActiveOnWorkDate,
} from "../utils/assignment-period";
import { workdayMaterializationService } from "./workday-materialization.service";

export type AssignEmployeeInTransactionOutcome =
  | {
      outcome: "added";
      assignment: OperationEmployeeAssignment;
    }
  | {
      outcome: "skipped";
      reason: WorkTeamAssignmentSkipReason;
      existingAssignmentId?: string;
    };

const periodsAreEquivalent = (
  leftFrom: string,
  leftUntil: string | null,
  rightFrom: string,
  rightUntil: string | null,
): boolean => leftFrom === rightFrom && leftUntil === rightUntil;

export const classifyAssignmentOverlap = (
  existing: OperationEmployeeAssignment,
  validFrom: string,
  validUntil: string | null,
): WorkTeamAssignmentSkipReason => {
  const conflict = assignmentPeriodsOverlap({
    existing,
    requested: { validFrom, validUntil },
  });
  if (conflict === "already_assigned") {
    return "already_assigned";
  }
  return "assignment_period_overlap";
};

export const operationAssignmentCore = {
  async assignEmployeeInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      operationId: string;
      employeeId: string;
      validFrom: string;
      validUntil: string | null;
      employeeActive: boolean;
      operationKind: string;
      operationWorkDate: string | null;
      sourceAssignmentBatchId?: string | null;
      sourceWorkTeamId?: string | null;
    },
  ): Promise<AssignEmployeeInTransactionOutcome> {
    if (!input.employeeActive) {
      return { outcome: "skipped", reason: "employee_inactive" };
    }

    const overlap = await operationEmployeeRepository.findOverlappingInTransaction(
      companyId,
      transaction,
      {
        operationId: input.operationId,
        employeeId: input.employeeId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
      },
    );

    if (overlap) {
      if (
        input.operationKind === "ONE_TIME" &&
        input.operationWorkDate &&
        periodsAreEquivalent(
          overlap.validFrom,
          overlap.validUntil,
          input.validFrom,
          input.validUntil,
        )
      ) {
        const existingWorkday = await employeeWorkdayRepository.findByOperationAndEmployeeInTransaction(
          companyId,
          transaction,
          input.operationId,
          input.employeeId,
        );
        if (!existingWorkday) {
          await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
            companyId,
            transaction,
            input.operationId,
            input.employeeId,
            overlap.id,
            input.operationWorkDate,
          );
        }
      }

      return {
        outcome: "skipped",
        reason: classifyAssignmentOverlap(overlap, input.validFrom, input.validUntil),
        existingAssignmentId: overlap.id,
      };
    }

    const assignment = await operationEmployeeRepository.createInTransaction(
      companyId,
      transaction,
      {
        operationId: input.operationId,
        employeeId: input.employeeId,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        sourceAssignmentBatchId: input.sourceAssignmentBatchId ?? null,
        sourceWorkTeamId: input.sourceWorkTeamId ?? null,
        assignmentOrigin: input.sourceAssignmentBatchId ? "WORK_TEAM" : "MANUAL",
      },
    );

    if (
      input.operationKind === "ONE_TIME" &&
      input.operationWorkDate &&
      isAssignmentActiveOnWorkDate({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        workDate: input.operationWorkDate,
      })
    ) {
      await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
        companyId,
        transaction,
        input.operationId,
        input.employeeId,
        assignment.id,
        input.operationWorkDate,
      );
    }

    return { outcome: "added", assignment };
  },

  resolveValidity(
    operationKind: string,
    operationWorkDate: string | null,
    input?: { validFrom?: string; validUntil?: string | null },
  ): { validFrom: string; validUntil: string | null } {
    const validFrom = input?.validFrom ?? operationWorkDate;
    const validUntil =
      input?.validUntil !== undefined
        ? input.validUntil
        : operationKind === "ONE_TIME"
          ? operationWorkDate
          : null;

    if (!validFrom) {
      throw new AppError(400, "ASSIGNMENT_VALID_FROM_REQUIRED", "La fecha de inicio es obligatoria");
    }

    try {
      assertValidAssignmentDateRange(validFrom, validUntil);
    } catch {
      throw new AppError(
        400,
        "ASSIGNMENT_INVALID_DATE_RANGE",
        "La fecha de finalización no puede ser anterior a la fecha de inicio",
      );
    }

    if (
      operationKind === "ONE_TIME" &&
      operationWorkDate &&
      !isAssignmentActiveOnWorkDate({ validFrom, validUntil, workDate: operationWorkDate })
    ) {
      throw new AppError(
        409,
        "ASSIGNMENT_OUTSIDE_OPERATION_WORK_DATE",
        "La asignación debe cubrir la fecha de la operación",
      );
    }

    return { validFrom, validUntil };
  },
};
