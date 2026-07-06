import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import {
  assertValidAssignmentDateRange,
  isAssignmentActiveOnWorkDate,
  resolveAssignmentLifecycleState,
} from "../utils/assignment-period";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { isOperationAssignable } from "../utils/operation-status";
import { operationWorkDateService } from "./operation-work-date.service";
import { workdayMaterializationService } from "./workday-materialization.service";

const withLifecycleState = (
  assignment: OperationEmployeeAssignment,
  referenceDate: string,
): OperationEmployeeAssignment => {
  if (assignment.cancelledAt) {
    return { ...assignment, lifecycleState: undefined };
  }

  const lifecycleState = resolveAssignmentLifecycleState(
    {
      validFrom: assignment.validFrom,
      validUntil: assignment.validUntil,
      cancelledAt: assignment.cancelledAt,
    },
    referenceDate,
  );

  return {
    ...assignment,
    lifecycleState: lifecycleState ?? undefined,
  };
};

const resolveLifecycleReferenceDate = async (
  companyId: string,
  operationId: string,
  operationKind: string,
): Promise<string> => {
  if (operationKind === "ONE_TIME") {
    return operationWorkDateService.resolveOperationWorkDate(companyId, operationId);
  }

  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  return getDateIsoInTimezone(new Date(), timezone);
};

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
      throw new AppError(
        409,
        "ASSIGNMENT_ATTENDANCE_CONFLICT",
        "No se puede modificar la vigencia porque existen registros de asistencia asociados fuera del nuevo período",
      );
    }

    if (workday.expectationStatus === "EXPECTED") {
      await employeeWorkdayRepository.cancelExpectationInTransaction(
        companyId,
        transaction,
        workday.id,
      );
    }
  }
};

const cancelExpectedEmployeeWorkdaysForAssignment = async (
  companyId: string,
  transaction: sql.Transaction,
  assignmentId: string,
): Promise<void> => {
  const workdays = await employeeWorkdayRepository.listByAssignmentInTransaction(
    companyId,
    transaction,
    assignmentId,
  );

  for (const workday of workdays) {
    if (workday.expectationStatus !== "EXPECTED") {
      continue;
    }

    const hasAttendance = await employeeWorkdayRepository.hasAttendanceInTransaction(
      companyId,
      transaction,
      workday.id,
    );
    if (hasAttendance) {
      throw new AppError(
        409,
        "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
        "No se puede cancelar la asignación porque ya existe asistencia registrada",
      );
    }

    await employeeWorkdayRepository.cancelExpectationInTransaction(
      companyId,
      transaction,
      workday.id,
    );
  }
};

export const operationAssignmentService = {
  async assignEmployee(
    companyId: string,
    operationId: string,
    employeeId: string,
    input?: { validFrom?: string; validUntil?: string | null },
  ) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    if (!isOperationAssignable(operation.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_ASSIGNABLE",
        "No se puede asignar empleados a operaciones canceladas o completadas",
      );
    }

    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
    }
    if (!employee.active) {
      throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asignar un empleado inactivo");
    }

    const operationKind = operation.operationKind ?? "ONE_TIME";
    const operationWorkDate =
      operationKind === "ONE_TIME"
        ? await operationWorkDateService.resolveOperationWorkDate(companyId, operationId)
        : null;

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

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const overlap = await operationEmployeeRepository.findOverlappingInTransaction(
        companyId,
        transaction,
        {
          operationId,
          employeeId,
          validFrom,
          validUntil,
        },
      );
      if (overlap) {
        if (operationWorkDate) {
          const existingWorkday =
            await employeeWorkdayRepository.findByOperationAndEmployeeInTransaction(
              companyId,
              transaction,
              operationId,
              employeeId,
            );
          if (!existingWorkday) {
            await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
              companyId,
              transaction,
              operationId,
              employeeId,
              overlap.id,
              operationWorkDate,
            );
            await transaction.commit();
            return withLifecycleState(overlap, operationWorkDate);
          }
        }
        throw new AppError(
          409,
          "ASSIGNMENT_PERIOD_OVERLAP",
          "El colaborador ya tiene una asignación vigente que se superpone con esas fechas",
        );
      }

      const assignment = await operationEmployeeRepository.createInTransaction(
        companyId,
        transaction,
        {
          operationId,
          employeeId,
          validFrom,
          validUntil,
        },
      );

      if (
        operationKind === "ONE_TIME" &&
        operationWorkDate &&
        isAssignmentActiveOnWorkDate({
          validFrom: assignment.validFrom,
          validUntil: assignment.validUntil,
          workDate: operationWorkDate,
        })
      ) {
        await workdayMaterializationService.ensureEmployeeWorkdayForAssignmentInTransaction(
          companyId,
          transaction,
          operationId,
          employeeId,
          assignment.id,
          operationWorkDate,
        );
      }

      await transaction.commit();
      return withLifecycleState(assignment, operationWorkDate ?? validFrom);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async listAssignmentPeriods(companyId: string, operationId: string) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const referenceDate = await resolveLifecycleReferenceDate(
      companyId,
      operationId,
      operation.operationKind ?? "ONE_TIME",
    );

    const assignments = await operationEmployeeRepository.listByOperation(companyId, operationId);
    return assignments.map((assignment) => withLifecycleState(assignment, referenceDate));
  },

  async cancelAssignment(companyId: string, operationId: string, assignmentId: string) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const assignment = await operationEmployeeRepository.findById(companyId, assignmentId);
    if (!assignment || assignment.operationId !== operationId) {
      throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación no existe");
    }
    if (assignment.cancelledAt) {
      throw new AppError(409, "ASSIGNMENT_ALREADY_CANCELLED", "La asignación ya está cancelada");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await cancelExpectedEmployeeWorkdaysForAssignment(companyId, transaction, assignmentId);
      const cancelled = await operationEmployeeRepository.cancelAssignmentInTransaction(
        companyId,
        transaction,
        assignmentId,
      );
      if (!cancelled) {
        throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación no existe");
      }

      await transaction.commit();
      const referenceDate = await resolveLifecycleReferenceDate(
        companyId,
        operationId,
        operation.operationKind ?? "ONE_TIME",
      );
      return withLifecycleState(cancelled, referenceDate);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async endAssignment(
    companyId: string,
    operationId: string,
    assignmentId: string,
    effectiveDate: string,
  ) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const assignment = await operationEmployeeRepository.findByIdInTransaction(
        companyId,
        transaction,
        assignmentId,
      );
      if (!assignment || assignment.operationId !== operationId) {
        throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación no existe");
      }
      if (assignment.cancelledAt) {
        throw new AppError(409, "ASSIGNMENT_ALREADY_CANCELLED", "La asignación ya está cancelada");
      }
      if (assignment.validUntil) {
        throw new AppError(
          409,
          "ASSIGNMENT_ALREADY_BOUNDED",
          "Solo se pueden finalizar asignaciones abiertas sin fecha de fin",
        );
      }

      if (compareEffectiveDate(effectiveDate, assignment.validFrom) < 0) {
        throw new AppError(
          400,
          "ASSIGNMENT_INVALID_END_DATE",
          "La fecha efectiva no puede ser anterior al inicio de la asignación",
        );
      }

      const overlap = await operationEmployeeRepository.findOverlappingInTransaction(
        companyId,
        transaction,
        {
          operationId: assignment.operationId,
          employeeId: assignment.employeeId,
          validFrom: assignment.validFrom,
          validUntil: effectiveDate,
          excludeAssignmentId: assignment.id,
        },
      );
      if (overlap) {
        throw new AppError(
          409,
          "ASSIGNMENT_PERIOD_OVERLAP",
          "El colaborador ya tiene una asignación vigente que se superpone con esas fechas",
        );
      }

      const updated = await operationEmployeeRepository.endAssignmentInTransaction(
        companyId,
        transaction,
        assignmentId,
        effectiveDate,
      );
      if (!updated) {
        throw new AppError(
          409,
          "ASSIGNMENT_INVALID_END_DATE",
          "No se pudo finalizar la asignación con la fecha indicada",
        );
      }

      await reconcileEmployeeWorkdaysOutsideAssignment(companyId, transaction, updated);

      await transaction.commit();
      const referenceDate = await resolveLifecycleReferenceDate(
        companyId,
        operationId,
        operation.operationKind ?? "ONE_TIME",
      );
      return withLifecycleState(updated, referenceDate);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};

const compareEffectiveDate = (left: string, right: string): number => left.localeCompare(right);
