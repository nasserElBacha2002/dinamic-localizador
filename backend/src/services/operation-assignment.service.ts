import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { employeeRepository } from "../repositories/employee.repository";
import { employeeWorkdayRepository } from "../repositories/employee-workday.repository";
import { employeeDeactivationRepository } from "../repositories/employee-deactivation.repository";
import { operationAssignmentNotificationRepository } from "../repositories/operation-assignment-notification.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type { OperationEmployeeAssignment } from "../types/domain";
import {
  isAssignmentActiveOnWorkDate,
  resolveAssignmentLifecycleState,
} from "../utils/assignment-period";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { isOperationAssignable } from "../utils/operation-status";
import { safeRollback } from "../utils/safe-transaction";
import { logAuditSafe } from "../utils/audit-post-commit";
import { operationWorkDateService } from "./operation-work-date.service";
import { operationAssignmentCore } from "./operation-assignment-core.service";
import { auditService } from "./audit.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";

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
        "ASSIGNMENT",
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

  // Reject destructive cancellation if ANY workday of this assignment already
  // has attendance, regardless of its current expectation status. This keeps
  // historical attendance intact; recurring assignments must be ended instead.
  for (const workday of workdays) {
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
  }

  for (const workday of workdays) {
    if (workday.expectationStatus !== "EXPECTED") {
      continue;
    }

    await employeeWorkdayRepository.cancelExpectationInTransaction(
      companyId,
      transaction,
      workday.id,
      "ASSIGNMENT",
    );
  }
};

export const operationAssignmentService = {
  async assignEmployee(
    companyId: string,
    operationId: string,
    employeeId: string,
    input?: { validFrom?: string; validUntil?: string | null },
    userId?: string | null,
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

    const { validFrom, validUntil } = operationAssignmentCore.resolveValidity(
      operationKind,
      operationWorkDate,
      input,
    );

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let committedAssignment: OperationEmployeeAssignment | null = null;

    try {
      const lockedEmployee = await employeeDeactivationRepository.lockEmployeeForUpdate(
        companyId,
        employeeId,
        transaction,
      );
      if (!lockedEmployee) {
        throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Empleado no encontrado");
      }
      if (!lockedEmployee.active) {
        throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asignar un empleado inactivo");
      }

      const result = await operationAssignmentCore.assignEmployeeInTransaction(
        companyId,
        transaction,
        {
          operationId,
          employeeId,
          validFrom,
          validUntil,
          employeeActive: lockedEmployee.active,
          operationKind,
          operationWorkDate,
        },
      );

      if (result.outcome === "skipped") {
        if (result.reason === "already_assigned" && result.existingAssignmentId) {
          const existing = await operationEmployeeRepository.findById(
            companyId,
            result.existingAssignmentId,
          );
          if (existing && !existing.cancelledAt) {
            await transaction.commit();
            transactionClosed = true;
            return withLifecycleState(existing, operationWorkDate ?? validFrom);
          }
        }
        if (
          result.reason === "already_assigned" ||
          result.reason === "assignment_period_overlap"
        ) {
          throw new AppError(
            409,
            "ASSIGNMENT_PERIOD_OVERLAP",
            "El colaborador ya tiene una asignación vigente que se superpone con esas fechas",
          );
        }
        throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede asignar un empleado inactivo");
      }

      await transaction.commit();
      transactionClosed = true;
      committedAssignment = result.assignment;
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    if (operationKind === "RECURRING" && committedAssignment) {
      try {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          operationId,
          () =>
            recurringWorkdayMaterializationService.reconcileAfterAssignmentChange(
              companyId,
              operationId,
              committedAssignment!,
            ),
          "recurring assignment create",
        );
      } catch (error) {
        console.error("[operation-assignment] recurring sync failed after commit", error);
      }
    }

    await logAuditSafe("operation_assignment.create", () =>
      auditService.log(companyId, {
        entityType: "operation_assignment",
        entityId: committedAssignment!.id,
        action: "create",
        newData: {
          operationId,
          employeeId,
          validFrom,
          validUntil,
          assignmentOrigin: "MANUAL",
        },
        userId: userId ?? null,
      }),
    );

    return withLifecycleState(committedAssignment!, operationWorkDate ?? validFrom);
  },

  async assignEmployeesBatch(
    companyId: string,
    operationId: string,
    employeeIds: string[],
    input?: { validFrom?: string; validUntil?: string | null },
    userId?: string | null,
  ) {
    const uniqueIds = [...new Set(employeeIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Seleccioná al menos un colaborador");
    }

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

    const operationKind = operation.operationKind ?? "ONE_TIME";
    const operationWorkDate =
      operationKind === "ONE_TIME"
        ? await operationWorkDateService.resolveOperationWorkDate(companyId, operationId)
        : null;

    const { validFrom, validUntil } = operationAssignmentCore.resolveValidity(
      operationKind,
      operationWorkDate,
      input,
    );

    const employees = await employeeRepository.listByIds(companyId, uniqueIds);
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));

    for (const employeeId of uniqueIds) {
      const employee = employeeById.get(employeeId);
      if (!employee) {
        throw new AppError(
          404,
          "EMPLOYEE_NOT_FOUND",
          `Empleado no encontrado: ${employeeId}`,
        );
      }
      if (!employee.active) {
        throw new AppError(
          409,
          "EMPLOYEE_INACTIVE",
          `No se puede asignar un empleado inactivo: ${employee.name}`,
        );
      }
    }

    const skipReasonMessage = (reason: string): { code: string; reason: string } => {
      if (reason === "already_assigned") {
        return {
          code: "ASSIGNMENT_ALREADY_EXISTS",
          reason: "Ya está asignado en el período indicado.",
        };
      }
      return {
        code: "ASSIGNMENT_PERIOD_OVERLAP",
        reason: "Tiene una asignación que se superpone con esas fechas.",
      };
    };

    const assignedIds: string[] = [];
    const skipped: Array<{
      employeeId: string;
      employeeName: string;
      code: string;
      reason: string;
    }> = [];
    const committedAssignments: OperationEmployeeAssignment[] = [];

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let transactionClosed = false;

    try {
      // Stable lock order to reduce deadlocks with concurrent singular/batch assigns.
      const lockOrder = [...uniqueIds].sort((left, right) => left.localeCompare(right));
      for (const employeeId of lockOrder) {
        const locked = await employeeDeactivationRepository.lockEmployeeForUpdate(
          companyId,
          employeeId,
          transaction,
        );
        if (!locked) {
          throw new AppError(404, "EMPLOYEE_NOT_FOUND", `Empleado no encontrado: ${employeeId}`);
        }
        if (!locked.active) {
          const employee = employeeById.get(employeeId);
          throw new AppError(
            409,
            "EMPLOYEE_INACTIVE",
            `No se puede asignar un empleado inactivo: ${employee?.name ?? employeeId}`,
          );
        }
      }

      for (const employeeId of uniqueIds) {
        const employee = employeeById.get(employeeId)!;
        const result = await operationAssignmentCore.assignEmployeeInTransaction(
          companyId,
          transaction,
          {
            operationId,
            employeeId,
            validFrom,
            validUntil,
            employeeActive: employee.active,
            operationKind,
            operationWorkDate,
          },
        );

        if (result.outcome === "skipped") {
          if (
            result.reason === "already_assigned" ||
            result.reason === "assignment_period_overlap"
          ) {
            skipped.push({
              employeeId,
              employeeName: employee.name,
              ...skipReasonMessage(result.reason),
            });
            continue;
          }
          throw new AppError(
            409,
            "EMPLOYEE_INACTIVE",
            `No se puede asignar un empleado inactivo: ${employee.name}`,
          );
        }

        assignedIds.push(employeeId);
        committedAssignments.push(result.assignment);
      }

      await transaction.commit();
      transactionClosed = true;
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    if (operationKind === "RECURRING" && committedAssignments.length > 0) {
      try {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          operationId,
          async () => {
            for (const assignment of committedAssignments) {
              await recurringWorkdayMaterializationService.reconcileAfterAssignmentChange(
                companyId,
                operationId,
                assignment,
              );
            }
          },
          "recurring assignment batch create",
        );
      } catch (error) {
        console.error("[operation-assignment] recurring sync failed after batch commit", error);
      }
    }

    for (const assignment of committedAssignments) {
      await logAuditSafe("operation_assignment.create", () =>
        auditService.log(companyId, {
          entityType: "operation_assignment",
          entityId: assignment.id,
          action: "create",
          newData: {
            operationId,
            employeeId: assignment.employeeId,
            validFrom,
            validUntil,
            assignmentOrigin: "MANUAL",
            batch: true,
          },
          userId: userId ?? null,
        }),
      );
    }

    return {
      assignedCount: assignedIds.length,
      assignedIds,
      skippedCount: skipped.length,
      skipped,
    };
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

  /**
   * Cancel an assignment inside a caller-owned transaction (no nested commit).
   */
  async cancelAssignmentInSharedTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: { operationId: string; assignmentId: string },
  ): Promise<OperationEmployeeAssignment> {
    const assignment = await operationEmployeeRepository.findByIdInTransaction(
      companyId,
      transaction,
      input.assignmentId,
    );
    if (!assignment || assignment.operationId !== input.operationId) {
      throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación no existe");
    }
    if (assignment.cancelledAt) {
      throw new AppError(409, "ASSIGNMENT_ALREADY_CANCELLED", "La asignación ya está cancelada");
    }

    await cancelExpectedEmployeeWorkdaysForAssignment(companyId, transaction, input.assignmentId);
    const cancelledAssignment = await operationEmployeeRepository.cancelAssignmentInTransaction(
      companyId,
      transaction,
      input.assignmentId,
    );
    if (!cancelledAssignment) {
      throw new AppError(404, "OPERATION_ASSIGNMENT_NOT_FOUND", "La asignación no existe");
    }

    await operationAssignmentNotificationRepository.requestCancelForAssignment(
      companyId,
      input.assignmentId,
      transaction,
    );

    return cancelledAssignment;
  },

  async cancelAssignment(
    companyId: string,
    operationId: string,
    assignmentId: string,
    userId?: string | null,
  ) {
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

    let transactionClosed = false;
    let cancelled: OperationEmployeeAssignment | null = null;

    try {
      const cancelledAssignment = await this.cancelAssignmentInSharedTransaction(
        companyId,
        transaction,
        { operationId, assignmentId },
      );

      await transaction.commit();
      transactionClosed = true;
      cancelled = cancelledAssignment;
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    await logAuditSafe("operation_assignment.cancel", () =>
      auditService.log(companyId, {
        entityType: "operation_assignment",
        entityId: assignmentId,
        action: "cancel",
        previousData: { operationId, assignmentId },
        userId: userId ?? null,
      }),
    );

    if ((operation.operationKind ?? "ONE_TIME") === "RECURRING" && cancelled) {
      try {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          operationId,
          () =>
            recurringWorkdayMaterializationService.reconcileAfterAssignmentChange(
              companyId,
              operationId,
              cancelled!,
            ),
          "recurring assignment cancel",
        );
      } catch (error) {
        console.error("[operation-assignment] recurring sync failed after commit", error);
      }
    }

    const referenceDate = await resolveLifecycleReferenceDate(
      companyId,
      operationId,
      operation.operationKind ?? "ONE_TIME",
    );
    return withLifecycleState(cancelled!, referenceDate);
  },

  async endAssignment(
    companyId: string,
    operationId: string,
    assignmentId: string,
    effectiveDate: string,
    userId?: string | null,
  ) {
    const operation = await operationRepository.findById(companyId, operationId);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let transactionClosed = false;
    let updated: OperationEmployeeAssignment | null = null;

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

      const ended = await operationEmployeeRepository.endAssignmentInTransaction(
        companyId,
        transaction,
        assignmentId,
        effectiveDate,
      );
      if (!ended) {
        throw new AppError(
          409,
          "ASSIGNMENT_INVALID_END_DATE",
          "No se pudo finalizar la asignación con la fecha indicada",
        );
      }

      await reconcileEmployeeWorkdaysOutsideAssignment(companyId, transaction, ended);

      await transaction.commit();
      transactionClosed = true;
      updated = ended;
    } catch (error) {
      if (!transactionClosed) {
        await safeRollback(transaction);
      }
      throw error;
    }

    await logAuditSafe("operation_assignment.end", () =>
      auditService.log(companyId, {
        entityType: "operation_assignment",
        entityId: assignmentId,
        action: "end",
        newData: { operationId, assignmentId, effectiveDate },
        userId: userId ?? null,
      }),
    );

    if ((operation.operationKind ?? "ONE_TIME") === "RECURRING" && updated) {
      try {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          operationId,
          () =>
            recurringWorkdayMaterializationService.reconcileAfterAssignmentChange(
              companyId,
              operationId,
              updated!,
            ),
          "recurring assignment end",
        );
      } catch (error) {
        console.error("[operation-assignment] recurring sync failed after commit", error);
      }
    }

    const referenceDate = await resolveLifecycleReferenceDate(
      companyId,
      operationId,
      operation.operationKind ?? "ONE_TIME",
    );
    return withLifecycleState(updated!, referenceDate);
  },
};

const compareEffectiveDate = (left: string, right: string): number => left.localeCompare(right);
