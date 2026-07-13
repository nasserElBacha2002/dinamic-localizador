import sql from "mssql";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { EmployeeWorkday, OperationWorkday } from "../types/workday";
import { isAssignmentActiveOnWorkDate } from "../utils/assignment-period";
import { isRecoverableCancelledExpectation } from "../utils/employee-workday-recovery";
import { operationWorkdayResolver } from "./operation-workday-resolver";
import { resolveOperationTimezone } from "../utils/operation-timezone";

const resolveTimezoneForCompany = async (companyId: string): Promise<string> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  return resolveOperationTimezone(settings?.operationTimezone);
};

const assertOneTimeWorkdayInvariant = (operationId: string, workdays: OperationWorkday[]): void => {
  if (workdays.length > 1) {
    throw new AppError(
      500,
      "ONE_TIME_OPERATION_MULTIPLE_WORKDAYS",
      `La operación ONE_TIME ${operationId} tiene múltiples jornadas materializadas`,
    );
  }
};

const ensureOperationWorkdayRow = async (
  companyId: string,
  operationId: string,
  transaction?: sql.Transaction,
): Promise<OperationWorkday> => {
  const operation = await operationRepository.findById(companyId, operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
  }

  const operationKind = operation.operationKind ?? "ONE_TIME";
  if (operationKind === "RECURRING") {
    throw new AppError(
      501,
      "RECURRING_OPERATION_NOT_SUPPORTED",
      "Las operaciones recurrentes aún no están disponibles",
    );
  }

  const findOneTimeExisting = transaction
    ? () => operationWorkdayRepository.listByOperationIdInTransaction(companyId, transaction, operationId)
    : () => operationWorkdayRepository.listByOperationId(companyId, operationId);

  const oneTimeWorkdays = await findOneTimeExisting();
  assertOneTimeWorkdayInvariant(operationId, oneTimeWorkdays);
  if (oneTimeWorkdays[0]) {
    return oneTimeWorkdays[0];
  }

  const timezone = await resolveTimezoneForCompany(companyId);
  const resolved = operationWorkdayResolver.resolveOneTime(operation, timezone);

  const findByDate = transaction
    ? () =>
        operationWorkdayRepository.findByOperationAndWorkDateInTransaction(
          companyId,
          transaction,
          operationId,
          resolved.workDate,
        )
    : () =>
        operationWorkdayRepository.findByOperationAndWorkDate(
          companyId,
          operationId,
          resolved.workDate,
        );

  const existingByDate = await findByDate();
  if (existingByDate) {
    return existingByDate;
  }

  const insertPayload = {
    operationId,
    workDate: resolved.workDate,
    expectedStartAt: resolved.expectedStartAt,
    expectedEndAt: resolved.expectedEndAt,
    earlyToleranceMinutes: resolved.earlyToleranceMinutes,
    lateToleranceMinutes: resolved.lateToleranceMinutes,
    scheduleVersion: resolved.scheduleVersion,
  };

  try {
    if (transaction) {
      return await operationWorkdayRepository.insertInTransaction(
        companyId,
        transaction,
        insertPayload,
      );
    }
    return await operationWorkdayRepository.insert(companyId, insertPayload);
  } catch (error) {
    if (!operationWorkdayRepository.isDuplicateKeyError(error)) {
      throw error;
    }
    const racedOneTime = await findOneTimeExisting();
    assertOneTimeWorkdayInvariant(operationId, racedOneTime);
    if (racedOneTime[0]) {
      return racedOneTime[0];
    }
    const racedByDate = await findByDate();
    if (!racedByDate) {
      throw error;
    }
    return racedByDate;
  }
};

const reactivateAssignmentCancelledWorkday = async (
  companyId: string,
  existing: EmployeeWorkday,
  operationAssignmentId: string,
  transaction?: sql.Transaction,
): Promise<EmployeeWorkday | null> => {
  const hasAttendance = transaction
    ? await employeeWorkdayRepository.hasAttendanceInTransaction(
        companyId,
        transaction,
        existing.id,
      )
    : await employeeWorkdayRepository.hasAttendance(companyId, existing.id);

  const recoverable = await isRecoverableCancelledExpectation(
    companyId,
    existing,
    operationAssignmentId,
    hasAttendance,
  );

  if (!recoverable) {
    return null;
  }

  if (hasAttendance) {
    throw new AppError(
      409,
      "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
      "No se puede reasignar porque ya existe asistencia registrada para esta jornada",
    );
  }

  if (transaction) {
    return employeeWorkdayRepository.reactivateAssignmentCancelledExpectationInTransaction(
      companyId,
      transaction,
      existing.id,
      operationAssignmentId,
    );
  }

  return employeeWorkdayRepository.reactivateAssignmentCancelledExpectation(
    companyId,
    existing.id,
    operationAssignmentId,
  );
};

const ensureEmployeeWorkdayRow = async (
  companyId: string,
  operationWorkday: OperationWorkday,
  employeeId: string,
  operationAssignmentId: string,
  transaction?: sql.Transaction,
): Promise<EmployeeWorkday> => {
  const findExisting = transaction
    ? () =>
        employeeWorkdayRepository.findByWorkdayAndEmployeeInTransaction(
          companyId,
          transaction,
          operationWorkday.id,
          employeeId,
        )
    : () =>
        employeeWorkdayRepository.findByWorkdayAndEmployee(
          companyId,
          operationWorkday.id,
          employeeId,
        );

  const existing = await findExisting();
  if (existing) {
    const reactivated = await reactivateAssignmentCancelledWorkday(
      companyId,
      existing,
      operationAssignmentId,
      transaction,
    );
    if (reactivated) {
      return reactivated;
    }

    if (
      existing.expectationStatus === "CANCELLED" &&
      existing.cancellationReason === "ASSIGNMENT"
    ) {
      const hasAttendance = transaction
        ? await employeeWorkdayRepository.hasAttendanceInTransaction(
            companyId,
            transaction,
            existing.id,
          )
        : await employeeWorkdayRepository.hasAttendance(companyId, existing.id);

      if (hasAttendance) {
        throw new AppError(
          409,
          "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
          "No se puede reasignar porque ya existe asistencia registrada para esta jornada",
        );
      }

      throw new AppError(
        409,
        "EMPLOYEE_WORKDAY_REACTIVATION_FAILED",
        "No se pudo reactivar la jornada del empleado para la nueva asignación",
      );
    }

    if (!existing.operationAssignmentId) {
      const assignment = await operationEmployeeRepository.findById(
        companyId,
        operationAssignmentId,
      );
      if (
        !assignment ||
        assignment.employeeId !== employeeId ||
        assignment.operationId !== operationWorkday.operationId ||
        !isAssignmentActiveOnWorkDate({
          validFrom: assignment.validFrom,
          validUntil: assignment.validUntil,
          workDate: operationWorkday.workDate,
          cancelledAt: assignment.cancelledAt,
        })
      ) {
        throw new AppError(
          409,
          "EMPLOYEE_WORKDAY_ASSIGNMENT_MISMATCH",
          "La jornada del empleado no coincide con la asignación activa",
        );
      }

      if (transaction) {
        return employeeWorkdayRepository.attachAssignmentInTransaction(
          companyId,
          transaction,
          existing.id,
          operationAssignmentId,
        );
      }
      return employeeWorkdayRepository.attachAssignment(companyId, existing.id, operationAssignmentId);
    }

    if (existing.operationAssignmentId !== operationAssignmentId) {
      throw new AppError(
        409,
        "EMPLOYEE_WORKDAY_ASSIGNMENT_MISMATCH",
        "La jornada del empleado ya está vinculada a otra asignación",
      );
    }

    if (existing.expectationStatus === "CANCELLED") {
      throw new AppError(
        409,
        "EMPLOYEE_WORKDAY_REACTIVATION_FAILED",
        "No se pudo reactivar la jornada del empleado para la nueva asignación",
      );
    }

    return existing;
  }

  const insertPayload = {
    operationWorkdayId: operationWorkday.id,
    employeeId,
    operationAssignmentId,
    expectationStatus: "EXPECTED" as const,
  };

  try {
    if (transaction) {
      return await employeeWorkdayRepository.insertInTransaction(
        companyId,
        transaction,
        insertPayload,
      );
    }
    return await employeeWorkdayRepository.insert(companyId, insertPayload);
  } catch (error) {
    if (!employeeWorkdayRepository.isDuplicateKeyError(error)) {
      throw error;
    }
    const raced = await findExisting();
    if (!raced) {
      throw error;
    }
    const reactivated = await reactivateAssignmentCancelledWorkday(
      companyId,
      raced,
      operationAssignmentId,
      transaction,
    );
    if (reactivated) {
      return reactivated;
    }

    if (
      raced.expectationStatus === "CANCELLED" &&
      raced.cancellationReason === "ASSIGNMENT"
    ) {
      const hasAttendance = transaction
        ? await employeeWorkdayRepository.hasAttendanceInTransaction(
            companyId,
            transaction,
            raced.id,
          )
        : await employeeWorkdayRepository.hasAttendance(companyId, raced.id);

      if (hasAttendance) {
        throw new AppError(
          409,
          "ASSIGNMENT_HAS_ATTENDANCE_RECORDS",
          "No se puede reasignar porque ya existe asistencia registrada para esta jornada",
        );
      }

      throw new AppError(
        409,
        "EMPLOYEE_WORKDAY_REACTIVATION_FAILED",
        "No se pudo reactivar la jornada del empleado para la nueva asignación",
      );
    }

    return raced;
  }
};

export const workdayMaterializationService = {
  async ensureOperationWorkday(
    companyId: string,
    operationId: string,
  ): Promise<OperationWorkday> {
    return ensureOperationWorkdayRow(companyId, operationId);
  },

  async ensureEmployeeWorkday(
    companyId: string,
    operationId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday> {
    const operationWorkday = await ensureOperationWorkdayRow(companyId, operationId);
    const assignment = await operationEmployeeRepository.findActiveForEmployeeOnWorkDate(
      companyId,
      operationId,
      employeeId,
      operationWorkday.workDate,
    );
    if (!assignment) {
      throw new AppError(
        409,
        "EMPLOYEE_NOT_ASSIGNED_TO_OPERATION",
        "El empleado no está asignado a la operación",
      );
    }

    return ensureEmployeeWorkdayRow(
      companyId,
      operationWorkday,
      employeeId,
      assignment.id,
    );
  },

  async ensureEmployeeWorkdayInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    employeeId: string,
  ): Promise<EmployeeWorkday> {
    const operationWorkday = await ensureOperationWorkdayRow(companyId, operationId, transaction);
    const assignment = await operationEmployeeRepository.findActiveForEmployeeOnWorkDate(
      companyId,
      operationId,
      employeeId,
      operationWorkday.workDate,
      transaction,
    );
    if (!assignment) {
      throw new AppError(
        409,
        "EMPLOYEE_NOT_ASSIGNED_TO_OPERATION",
        "El empleado no está asignado a la operación",
      );
    }

    return ensureEmployeeWorkdayRow(
      companyId,
      operationWorkday,
      employeeId,
      assignment.id,
      transaction,
    );
  },

  async ensureEmployeeWorkdayForAssignmentInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    operationId: string,
    employeeId: string,
    operationAssignmentId: string,
    workDate: string,
  ): Promise<EmployeeWorkday | null> {
    const assignment = await operationEmployeeRepository.findByIdInTransaction(
      companyId,
      transaction,
      operationAssignmentId,
    );
    if (
      !assignment ||
      assignment.operationId !== operationId ||
      assignment.employeeId !== employeeId ||
      !isAssignmentActiveOnWorkDate({
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil,
        workDate,
        cancelledAt: assignment.cancelledAt,
      })
    ) {
      return null;
    }

    const operationWorkday = await ensureOperationWorkdayRow(companyId, operationId, transaction);
    if (operationWorkday.workDate !== workDate) {
      return null;
    }

    return ensureEmployeeWorkdayRow(
      companyId,
      operationWorkday,
      employeeId,
      assignment.id,
      transaction,
    );
  },

  async ensureEmployeeWorkdayForRecurringAssignment(
    companyId: string,
    operationWorkday: OperationWorkday,
    employeeId: string,
    operationAssignmentId: string,
  ): Promise<EmployeeWorkday> {
    return ensureEmployeeWorkdayRow(
      companyId,
      operationWorkday,
      employeeId,
      operationAssignmentId,
    );
  },

  async ensureOneTimeOperationMaterialized(
    companyId: string,
    operationId: string,
  ): Promise<OperationWorkday> {
    return ensureOperationWorkdayRow(companyId, operationId);
  },
};
