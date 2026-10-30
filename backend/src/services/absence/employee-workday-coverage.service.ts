import sql from "mssql";
import { getPool } from "../../database/connection";
import { AppError } from "../../errors/app-error";
import { absenceOperationalImpactRepository } from "../../repositories/absence/absence-operational-impact.repository";
import { absenceRequestRepository } from "../../repositories/absence/absence-request.repository";
import { employeeDeactivationRepository } from "../../repositories/employees/employee-deactivation.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import { operationEmployeeRepository } from "../../repositories/operations/operation-employee.repository";
import {
  operationCoverageEventRepository,
  type CoverageEventSourceType,
} from "../../repositories/operations/operation-coverage-event.repository";
import { operationRepository } from "../../repositories/operations/operation.repository";
import {
  employeeWorkdayRepository,
  type EmployeeWorkdayWithSchedule,
} from "../../repositories/workdays/employee-workday.repository";
import type { OperationEmployeeAssignment } from "../../types/domain";
import { isWorkdayCoveredByAbsence } from "../../utils/absence/absence-workday-coverage";
import { resolveOperationOperationalDate } from "../../utils/operations/operation-change-events";
import { resolveOperationTimezone } from "../../utils/operations/operation-timezone";
import { isOperationAssignable } from "../../utils/operations/operation-status";
import { safeRollback } from "../../utils/safe-transaction";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { employeeAvailabilityService } from "../employees/employee-availability.service";
import { operationAssignmentCore } from "../operations/operation-assignment-core.service";
import { operationWorkDateService } from "../operations/operation-work-date.service";
import { absenceWorkdayCoverageReconciliationService } from "./absence-workday-coverage-reconciliation.service";
import { replacementRequestService } from "../replacement-request.service";

export type CoverEmployeeWorkdayInput = {
  operationId: string;
  employeeWorkdayId: string;
  replacementEmployeeId: string;
  replacedAssignmentId: string;
  replacedEmployeeId: string;
  coverageCommandId: string;
  sourceType: CoverageEventSourceType;
  absenceRequestId?: string | null;
  absenceConflictId?: string | null;
  sourceConflictId?: string | null;
  coverageReason?: string | null;
};

export type CoverEmployeeWorkdayResult = {
  replacementAssignment: OperationEmployeeAssignment;
  idempotent: boolean;
};

export type CoverEmployeeWorkdayOptions = {
  /** When false, caller resolves conflicts / replacement requests (e.g. conflict resolution API). */
  reconcileAbsence?: boolean;
};

const loadWorkdayContext = async (
  companyId: string,
  employeeWorkdayId: string,
): Promise<EmployeeWorkdayWithSchedule> => {
  const rows = await employeeWorkdayRepository.listWithWorkDatesByEmployeeWorkdayIds(companyId, [
    employeeWorkdayId,
  ]);
  const workday = rows[0];
  if (!workday) {
    throw new AppError(404, "EMPLOYEE_WORKDAY_NOT_FOUND", "Jornada del colaborador no encontrada");
  }
  return workday;
};

const validateCoverContext = async (
  companyId: string,
  input: CoverEmployeeWorkdayInput,
  workday: EmployeeWorkdayWithSchedule,
): Promise<void> => {
  if (workday.operationAssignmentId && workday.operationAssignmentId !== input.replacedAssignmentId) {
    throw new AppError(
      400,
      "COVERAGE_ASSIGNMENT_WORKDAY_MISMATCH",
      "La asignación indicada no corresponde a la jornada",
    );
  }
  if (workday.employeeId !== input.replacedEmployeeId) {
    throw new AppError(
      400,
      "COVERAGE_REPLACED_EMPLOYEE_MISMATCH",
      "El colaborador ausente no coincide con la jornada",
    );
  }
  if (!workday.operationId || workday.operationId !== input.operationId) {
    throw new AppError(
      400,
      "COVERAGE_OPERATION_WORKDAY_MISMATCH",
      "La operación no coincide con la jornada a cubrir",
    );
  }

  const operation = await operationRepository.findById(companyId, input.operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
  }
  if (!isOperationAssignable(operation.status)) {
    throw new AppError(
      409,
      "OPERATION_NOT_ASSIGNABLE",
      "No se puede asignar cobertura a operaciones canceladas o completadas",
    );
  }

  const replaced = await operationEmployeeRepository.findById(
    companyId,
    input.replacedAssignmentId,
  );
  if (!replaced || replaced.operationId !== input.operationId) {
    throw new AppError(
      404,
      "COVERAGE_REPLACED_ASSIGNMENT_NOT_FOUND",
      "La asignación a cubrir no existe en esta operación",
    );
  }
  if (replaced.employeeId !== input.replacedEmployeeId) {
    throw new AppError(
      400,
      "COVERAGE_REPLACED_EMPLOYEE_MISMATCH",
      "El empleado reemplazado no coincide con la asignación indicada",
    );
  }

  if (input.absenceRequestId) {
    const request = await absenceRequestRepository.findById(companyId, input.absenceRequestId);
    if (!request) {
      throw new AppError(404, "ABSENCE_REQUEST_NOT_FOUND", "Solicitud de ausencia no encontrada");
    }
    if (request.status !== "APPROVED") {
      throw new AppError(
        409,
        "ABSENCE_NOT_APPROVED",
        "La ausencia debe estar aprobada para registrar cobertura",
      );
    }
    if (request.employeeId !== input.replacedEmployeeId) {
      throw new AppError(
        400,
        "ABSENCE_EMPLOYEE_MISMATCH",
        "La ausencia no corresponde al colaborador de la jornada",
      );
    }
    if (
      !isWorkdayCoveredByAbsence(workday, {
        id: request.id,
        employeeId: request.employeeId,
        startDate: request.startDate,
        endDate: request.endDate,
        startPeriod: request.startPeriod,
        endPeriod: request.endPeriod,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
      })
    ) {
      throw new AppError(
        409,
        "WORKDAY_NOT_IN_ABSENCE",
        "La jornada no está cubierta por la ausencia indicada",
      );
    }
  }

  if (input.absenceConflictId && input.absenceRequestId) {
    const conflict = await absenceOperationalImpactRepository.findConflictById(
      companyId,
      input.absenceRequestId,
      input.absenceConflictId,
    );
    if (!conflict) {
      throw new AppError(
        404,
        "ABSENCE_OPERATIONAL_CONFLICT_NOT_FOUND",
        "Conflicto de ausencia no encontrado",
      );
    }
    if (conflict.status !== "OPEN" && conflict.status !== "RESOLVED") {
      throw new AppError(
        409,
        "ABSENCE_OPERATIONAL_CONFLICT_NOT_OPEN",
        "El conflicto de ausencia no admite cobertura",
      );
    }
    const conflictMatchesWorkday =
      (conflict.employeeWorkdayId && conflict.employeeWorkdayId === input.employeeWorkdayId) ||
      (conflict.assignmentId && conflict.assignmentId === input.replacedAssignmentId);
    if (!conflictMatchesWorkday) {
      throw new AppError(
        400,
        "ABSENCE_CONFLICT_WORKDAY_MISMATCH",
        "El conflicto no corresponde a la jornada indicada",
      );
    }
  }

  const intervalStart = new Date(workday.expectedStartAt);
  const intervalEnd = workday.expectedEndAt
    ? new Date(workday.expectedEndAt)
    : new Date(workday.expectedStartAt);

  const replacementLocked = await employeeRepository.findById(
    companyId,
    input.replacementEmployeeId,
  );
  if (!replacementLocked?.active) {
    throw new AppError(409, "REPLACEMENT_INVALID", "El reemplazo no es válido o está inactivo");
  }
  if (input.replacementEmployeeId === input.replacedEmployeeId) {
    throw new AppError(
      409,
      "COVERAGE_SAME_EMPLOYEE",
      "El reemplazo debe ser un colaborador distinto al ausente",
    );
  }

  const availability = await employeeAvailabilityService.getAvailabilityForInterval({
    companyId,
    employeeId: input.replacementEmployeeId,
    startAt: intervalStart,
    endAt: intervalEnd,
  });
  if (availability.status !== "AVAILABLE") {
    throw new AppError(
      409,
      "REPLACEMENT_UNAVAILABLE",
      "El reemplazo no está disponible en el intervalo de la jornada",
    );
  }
};

const executeCoverEmployeeWorkdayInTransaction = async (
  companyId: string,
  transaction: sql.Transaction,
  userId: string | null | undefined,
  input: CoverEmployeeWorkdayInput,
  options: CoverEmployeeWorkdayOptions = {},
): Promise<CoverEmployeeWorkdayResult> => {
  const reconcileAbsence = options.reconcileAbsence !== false;
  const commandId = input.coverageCommandId.trim();
  if (commandId.length < 8) {
    throw new AppError(
      400,
      "COVERAGE_COMMAND_ID_REQUIRED",
      "coverageCommandId es obligatorio para cubrir la jornada",
    );
  }

  const workday = await loadWorkdayContext(companyId, input.employeeWorkdayId);
  await validateCoverContext(companyId, input, workday);

  const operation = await operationRepository.findById(companyId, input.operationId);
  if (!operation) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
  }

  const existingByCommand = await operationCoverageEventRepository.findByCoverageCommandId(
    companyId,
    commandId,
    transaction,
  );
  if (existingByCommand) {
    if (existingByCommand.replacementEmployeeId !== input.replacementEmployeeId) {
      throw new AppError(
        409,
        "COVERAGE_COMMAND_CONFLICT",
        "El commandId ya fue usado con otro reemplazo",
      );
    }
    if (
      existingByCommand.absentEmployeeWorkdayId &&
      existingByCommand.absentEmployeeWorkdayId !== input.employeeWorkdayId
    ) {
      throw new AppError(
        409,
        "COVERAGE_COMMAND_CONFLICT",
        "El commandId ya fue usado para otra jornada",
      );
    }
    if (existingByCommand.replacementAssignmentId) {
      const assignment = await operationEmployeeRepository.findByIdInTransaction(
        companyId,
        transaction,
        existingByCommand.replacementAssignmentId,
      );
      if (assignment && !assignment.cancelledAt) {
        return { replacementAssignment: assignment, idempotent: true };
      }
    }
  }

  const existingActive = await operationCoverageEventRepository.findActiveByEmployeeWorkdayId(
    companyId,
    input.employeeWorkdayId,
    transaction,
  );
  if (existingActive) {
    if (existingActive.replacementEmployeeId === input.replacementEmployeeId) {
      const assignment = existingActive.replacementAssignmentId
        ? await operationEmployeeRepository.findByIdInTransaction(
            companyId,
            transaction,
            existingActive.replacementAssignmentId,
          )
        : null;
      if (assignment && !assignment.cancelledAt) {
        return { replacementAssignment: assignment, idempotent: true };
      }
    }
    throw new AppError(
      409,
      "COVERAGE_ALREADY_RECORDED",
      "Ya existe una cobertura activa para esa jornada",
    );
  }

  const lockedReplacement = await employeeDeactivationRepository.lockEmployeeForUpdate(
    companyId,
    input.replacementEmployeeId,
    transaction,
  );
  if (!lockedReplacement?.active) {
    throw new AppError(409, "REPLACEMENT_INVALID", "El reemplazo no es válido o está inactivo");
  }

  const operationKind = operation.operationKind ?? "ONE_TIME";
  const operationWorkDate =
    operationKind === "ONE_TIME"
      ? await operationWorkDateService.resolveOperationWorkDate(companyId, input.operationId)
      : workday.workDate;

  const replaced = await operationEmployeeRepository.findByIdInTransaction(
    companyId,
    transaction,
    input.replacedAssignmentId,
  );
  if (!replaced || replaced.cancelledAt) {
    throw new AppError(
      409,
      "COVERAGE_REPLACED_ASSIGNMENT_CANCELLED",
      "La asignación a cubrir ya no está vigente",
    );
  }

  const { validFrom, validUntil } = operationAssignmentCore.resolveValidity(
    operationKind,
    operationKind === "ONE_TIME" ? operationWorkDate : workday.workDate,
    operationKind === "RECURRING"
      ? { validFrom: workday.workDate, validUntil: workday.workDate }
      : { validFrom: replaced.validFrom, validUntil: replaced.validUntil },
  );

  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  const operationalDate = resolveOperationOperationalDate(
    {
      scheduledStart: operation.scheduledStart,
      workDate: workday.workDate,
    },
    timezone,
  );

  const resolvedShiftId = replaced.operationShiftId ?? null;

  if (operationKind === "ONE_TIME") {
    const { operationAssignmentService } = await import(
      "../operations/operation-assignment.service"
    );
    await operationAssignmentService.cancelAssignmentInSharedTransaction(companyId, transaction, {
      operationId: input.operationId,
      assignmentId: replaced.id,
    });
  } else {
    await employeeWorkdayRepository.cancelExpectationInTransaction(
      companyId,
      transaction,
      input.employeeWorkdayId,
      "ASSIGNMENT",
    );
  }

  const assignResult = await operationAssignmentCore.assignEmployeeInTransaction(
    companyId,
    transaction,
    {
      operationId: input.operationId,
      employeeId: input.replacementEmployeeId,
      validFrom,
      validUntil,
      employeeActive: lockedReplacement.active,
      operationKind,
      operationWorkDate: operationKind === "ONE_TIME" ? operationWorkDate : workday.workDate,
      assignmentOrigin: "COVERAGE",
      scheduleMode: operation.scheduleMode,
      operationShiftId: resolvedShiftId,
    },
  );

  if (assignResult.outcome === "skipped") {
    throw new AppError(
      409,
      "ASSIGNMENT_PERIOD_OVERLAP",
      "El colaborador ya tiene una asignación que se superpone con esa jornada",
    );
  }

  if (operationKind === "RECURRING") {
    await employeeWorkdayRepository.insertInTransaction(companyId, transaction, {
      operationWorkdayId: workday.operationWorkdayId,
      employeeId: input.replacementEmployeeId,
      operationAssignmentId: assignResult.assignment.id,
    });
  }

  const coverageInsert = await operationCoverageEventRepository.insert(
    {
      companyId,
      operationId: input.operationId,
      operationalDate,
      sourceType: input.sourceType,
      sourceConflictId: input.sourceConflictId ?? input.absenceConflictId ?? null,
      replacedAssignmentId: replaced.id,
      replacedEmployeeId: replaced.employeeId,
      replacementAssignmentId: assignResult.assignment.id,
      replacementEmployeeId: input.replacementEmployeeId,
      absentEmployeeWorkdayId: input.employeeWorkdayId,
      coverageCommandId: commandId,
      reason: input.coverageReason ?? null,
      resolvedByUserId: userId ?? null,
    },
    transaction,
  );
  if (!coverageInsert.inserted) {
    throw new AppError(
      409,
      "COVERAGE_ALREADY_RECORDED",
      "Ya existe una cobertura para esa jornada",
    );
  }

  if (reconcileAbsence && input.absenceRequestId) {
    await absenceWorkdayCoverageReconciliationService.syncAfterCoverageInTransaction({
      companyId,
      transaction,
      absenceRequestId: input.absenceRequestId,
      absenceConflictId: input.absenceConflictId,
      employeeWorkdayId: input.employeeWorkdayId,
      replacementEmployeeId: input.replacementEmployeeId,
      replacedAssignmentId: input.replacedAssignmentId,
      absentEmployeeId: input.replacedEmployeeId,
      coverageCommandId: commandId,
      resolvedByUserId: userId ?? null,
      resolutionReason: input.coverageReason ?? "Cobertura operativa",
    });
  }

  return { replacementAssignment: assignResult.assignment, idempotent: false };
};

export const employeeWorkdayCoverageService = {
  async coverEmployeeWorkdayInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    userId: string | null | undefined,
    input: CoverEmployeeWorkdayInput,
    options?: CoverEmployeeWorkdayOptions,
  ): Promise<CoverEmployeeWorkdayResult> {
    return executeCoverEmployeeWorkdayInTransaction(
      companyId,
      transaction,
      userId,
      input,
      options,
    );
  },

  async coverEmployeeWorkday(
    companyId: string,
    userId: string | null | undefined,
    input: CoverEmployeeWorkdayInput,
  ): Promise<CoverEmployeeWorkdayResult> {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const result = await executeCoverEmployeeWorkdayInTransaction(
        companyId,
        transaction,
        userId,
        input,
        { reconcileAbsence: true },
      );
      await transaction.commit();
      return result;
    } catch (error) {
      await safeRollback(transaction);
      throw error;
    }
  },

  async supersedeCoverageForReplacementAssignment(
    companyId: string,
    transaction: sql.Transaction,
    replacementAssignmentId: string,
  ): Promise<void> {
    const result = await new sql.Request(transaction)
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("replacementAssignmentId", sql.UniqueIdentifier, replacementAssignmentId)
      .query(`
        UPDATE operation_coverage_events
        SET superseded_at = SYSUTCDATETIME()
        OUTPUT INSERTED.absent_employee_workday_id, INSERTED.replaced_employee_id
        WHERE company_id = @companyId
          AND replacement_assignment_id = @replacementAssignmentId
          AND superseded_at IS NULL
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (row?.absent_employee_workday_id) {
      await replacementRequestService.reopenPendingForAbsentWorkdayInTransaction(companyId, transaction, {
        absentEmployeeWorkdayId: String(row.absent_employee_workday_id),
        absentEmployeeId: String(row.replaced_employee_id),
      });
    }
  },
};
