import sql from "mssql";
import { AppError } from "../errors/app-error";
import { getPool } from "../database/connection";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeDeactivationRepository } from "../repositories/employee-deactivation.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { Employee, OperationEmployeeAssignment } from "../types/domain";
import { getDateIsoInTimezone } from "../utils/absence-date";
import {
  buildDeactivationImpactRow,
  hasOperationalTemporalImpact,
  isAssignmentPeriodOpen,
  type DeactivationImpactCandidate,
} from "../utils/employee-deactivation-impact";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { safeRollback } from "../utils/safe-transaction";
import { logAuditSafe } from "../utils/audit-post-commit";
import { auditService } from "./audit.service";

export interface DeactivationImpactAssignment {
  assignmentId: string;
  operationId: string;
  operationName: string;
  operationType: "ONE_TIME" | "RECURRING";
  workdayId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
  locationName: string;
  workTeamName: string | null;
}

export interface EmployeeDeactivationImpact {
  collaboratorId: string;
  canDeactivateDirectly: boolean;
  affectedAssignmentsCount: number;
  affectedAssignments: DeactivationImpactAssignment[];
  activeWorkTeamMemberships: Array<{ workTeamId: string; workTeamName: string }>;
}

export interface DeactivateEmployeeInput {
  removeActiveAndFutureAssignments?: boolean;
}

export interface DeactivateEmployeeResult {
  employee: Employee;
  removedAssignments: Array<{
    assignmentId: string;
    operationId: string;
    action: "cancel" | "end" | "expectations_only";
    effectiveDate?: string;
  }>;
  removedWorkTeams: Array<{ workTeamId: string; workTeamName: string }>;
  previouslyActive?: boolean;
}

const filterImpactCandidates = (
  candidates: DeactivationImpactCandidate[],
  companyTodayIso: string,
  referenceAt: Date,
): DeactivationImpactCandidate[] =>
  candidates.filter((candidate) => {
    if (
      !isAssignmentPeriodOpen({
        validFrom: candidate.assignmentValidFrom,
        validUntil: candidate.assignmentValidUntil,
        cancelledAt: candidate.assignmentCancelledAt,
        companyTodayIso,
      })
    ) {
      return false;
    }

    return hasOperationalTemporalImpact({
      operationStatus: candidate.operationStatus,
      operationKind: candidate.operationKind,
      companyTodayIso,
      referenceAt,
      workDate: candidate.date,
      expectedStartAt: candidate.expectedStartAt,
      expectedEndAt: candidate.expectedEndAt,
      scheduledStart: candidate.scheduledStart,
      scheduledEnd: candidate.scheduledEnd,
    });
  });

const reconcileEmployeeWorkdaysOutsideAssignment = async (
  companyId: string,
  transaction: sql.Transaction,
  assignment: OperationEmployeeAssignment,
): Promise<void> => {
  const workdays = await employeeWorkdayRepository.listByAssignmentInTransaction(
    companyId,
    transaction,
    assignment.id,
  );

  for (const workday of workdays) {
    const operationWorkday = await operationWorkdayRepository.findById(
      companyId,
      workday.operationWorkdayId,
    );
    if (!operationWorkday) {
      continue;
    }

    const stillActive = isAssignmentActiveOnWorkDate({
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
      workDate: operationWorkday.workDate,
      cancelledAt: assignment.cancelledAt,
    });
    if (stillActive) {
      continue;
    }

    const hasAttendance = await employeeWorkdayRepository.hasAttendanceInTransaction(
      companyId,
      transaction,
      workday.id,
    );
    if (hasAttendance) {
      continue;
    }

    if (workday.expectationStatus === "EXPECTED") {
      await employeeWorkdayRepository.cancelExpectationInTransaction(
        companyId,
        transaction,
        workday.id,
        "ASSIGNMENT",
      );
    }
  }
};

const releaseAssignmentInTransaction = async (
  companyId: string,
  transaction: sql.Transaction,
  assignmentId: string,
  companyTodayIso: string,
): Promise<{
  assignmentId: string;
  operationId: string;
  action: "cancel" | "end" | "expectations_only";
  effectiveDate?: string;
} | null> => {
  const assignment = await operationEmployeeRepository.findByIdInTransaction(
    companyId,
    transaction,
    assignmentId,
  );
  if (!assignment || assignment.cancelledAt) {
    return null;
  }

  const workdays = await employeeWorkdayRepository.listByAssignmentInTransaction(
    companyId,
    transaction,
    assignmentId,
  );

  let hasAttendance = false;
  for (const workday of workdays) {
    const attended = await employeeWorkdayRepository.hasAttendanceInTransaction(
      companyId,
      transaction,
      workday.id,
    );
    if (attended) {
      hasAttendance = true;
      continue;
    }
    if (workday.expectationStatus === "EXPECTED") {
      await employeeWorkdayRepository.cancelExpectationInTransaction(
        companyId,
        transaction,
        workday.id,
        "ASSIGNMENT",
      );
    }
  }

  if (!hasAttendance) {
    const cancelled = await operationEmployeeRepository.cancelAssignmentInTransaction(
      companyId,
      transaction,
      assignmentId,
    );
    if (!cancelled) {
      return null;
    }
    return {
      assignmentId,
      operationId: cancelled.operationId,
      action: "cancel",
    };
  }

  // Preserve historical attendance: close open-ended periods so future materialization stops.
  if (!assignment.validUntil) {
    const ended = await operationEmployeeRepository.endAssignmentInTransaction(
      companyId,
      transaction,
      assignmentId,
      companyTodayIso,
    );
    if (!ended) {
      throw new AppError(
        409,
        "ASSIGNMENT_INVALID_END_DATE",
        "No se pudo cerrar la asignación con asistencia histórica",
      );
    }
    await reconcileEmployeeWorkdaysOutsideAssignment(companyId, transaction, ended);
    return {
      assignmentId,
      operationId: ended.operationId,
      action: "end",
      effectiveDate: companyTodayIso,
    };
  }

  await reconcileEmployeeWorkdaysOutsideAssignment(companyId, transaction, assignment);
  return {
    assignmentId,
    operationId: assignment.operationId,
    action: "expectations_only",
  };
};

export const employeeDeactivationService = {
  async getDeactivationImpact(
    companyId: string,
    employeeId: string,
    referenceAt = new Date(),
  ): Promise<EmployeeDeactivationImpact> {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const companyTodayIso = getDateIsoInTimezone(referenceAt, timezone);

    const candidates = await employeeDeactivationRepository.listImpactCandidates(
      companyId,
      employeeId,
    );
    const affected = filterImpactCandidates(candidates, companyTodayIso, referenceAt).map(
      (candidate) => buildDeactivationImpactRow(candidate, timezone),
    );

    const workTeams = await employeeDeactivationRepository.listActiveWorkTeamMemberships(
      companyId,
      employeeId,
    );

    return {
      collaboratorId: employeeId,
      canDeactivateDirectly: affected.length === 0,
      affectedAssignmentsCount: affected.length,
      affectedAssignments: affected,
      activeWorkTeamMemberships: workTeams,
    };
  },

  async deactivate(
    companyId: string,
    employeeId: string,
    input: DeactivateEmployeeInput = {},
    userId?: string | null,
    referenceAt = new Date(),
  ): Promise<DeactivateEmployeeResult> {
    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const timezone = resolveOperationTimezone(settings?.operationTimezone);
    const companyTodayIso = getDateIsoInTimezone(referenceAt, timezone);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let result: DeactivateEmployeeResult | null = null;

    try {
      const locked = await employeeDeactivationRepository.lockEmployeeForUpdate(
        companyId,
        employeeId,
        transaction,
      );
      if (!locked) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      // Idempotent: already inactive with nothing left to release.
      const candidates = await employeeDeactivationRepository.listImpactCandidates(
        companyId,
        employeeId,
        transaction,
      );
      const affected = filterImpactCandidates(candidates, companyTodayIso, referenceAt);

      if (affected.length > 0 && !input.removeActiveAndFutureAssignments) {
        throw new AppError(
          409,
          "EMPLOYEE_HAS_ACTIVE_OR_SCHEDULED_OPERATIONS",
          "No se puede desactivar un empleado con operaciones activas o programadas. Confirmá la desasignación para continuar.",
        );
      }

      const removedAssignments: DeactivateEmployeeResult["removedAssignments"] = [];
      if (affected.length > 0) {
        const uniqueAssignmentIds = [...new Set(affected.map((row) => row.assignmentId))];
        for (const assignmentId of uniqueAssignmentIds) {
          const released = await releaseAssignmentInTransaction(
            companyId,
            transaction,
            assignmentId,
            companyTodayIso,
          );
          if (released) {
            removedAssignments.push(released);
          }
        }
      }

      const removedWorkTeams = await employeeDeactivationRepository.removeFromAllWorkTeams(
        companyId,
        employeeId,
        transaction,
      );

      const employee = await employeeRepository.update(
        companyId,
        employeeId,
        { active: false },
        transaction,
      );
      if (!employee) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }

      await transaction.commit();
      transactionClosed = true;

      result = {
        employee,
        removedAssignments,
        removedWorkTeams,
        previouslyActive: locked.active,
      };
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    await logAuditSafe("employee.deactivate", () =>
      auditService.log(companyId, {
        entityType: "employee",
        entityId: employeeId,
        action: "deactivate",
        previousData: { active: result!.previouslyActive },
        newData: {
          active: false,
          removedAssignments: result!.removedAssignments,
          removedWorkTeams: result!.removedWorkTeams,
        },
        reason: "assisted_deactivation",
        userId: userId ?? null,
      }),
    );

    return {
      employee: result!.employee,
      removedAssignments: result!.removedAssignments,
      removedWorkTeams: result!.removedWorkTeams,
    };
  },
};

/** Exported for unit tests. */
export const __employeeDeactivationTestUtils = {
  filterImpactCandidates,
};
