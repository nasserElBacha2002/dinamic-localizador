import sql from "mssql";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { operationEmployeeRepository } from "../repositories/operation-employee.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationShiftRepository } from "../repositories/operation-shift.repository";
import { operationShiftVersionRepository } from "../repositories/operation-shift-version.repository";
import { operationWorkdayRepository } from "../repositories/operation-workday.repository";
import type {
  TransitionToMultiShiftInput,
  TransitionToSingleInput,
} from "../types/operation-shift";
import { getDateIsoInTimezone } from "../utils/absence-date";
import { addDaysToDateIso } from "../utils/recurring-workday-instant";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { normalizeShiftCode } from "../utils/shift-code";
import {
  assertEffectiveRange,
  assertShiftTimesDistinct,
  normalizeShiftTime,
  ShiftTimeError,
} from "../utils/shift-time";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const resolveCompanyOperationalToday = async (companyId: string): Promise<string> => {
  const settings = await companySettingsRepository.findByCompanyId(companyId);
  const timezone = resolveOperationTimezone(settings?.operationTimezone);
  return getDateIsoInTimezone(new Date(), timezone);
};

const assertEffectiveFromIsToday = async (
  companyId: string,
  effectiveFrom: string,
): Promise<void> => {
  const today = await resolveCompanyOperationalToday(companyId);
  if (effectiveFrom !== today) {
    throw new AppError(
      400,
      "TRANSITION_EFFECTIVE_FROM_MUST_BE_TODAY",
      "La transición solo puede ser inmediata: effectiveFrom debe ser la fecha operativa de hoy.",
    );
  }
};

const updateScheduleModeInTransaction = async (
  companyId: string,
  operationId: string,
  scheduleMode: "SINGLE" | "MULTI_SHIFT",
  transaction: sql.Transaction,
): Promise<void> => {
  const result = await new sql.Request(transaction)
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("operationId", sql.UniqueIdentifier, operationId)
    .input("scheduleMode", sql.NVarChar(20), scheduleMode)
    .query(`
      UPDATE dbo.scheduled_operations
      SET schedule_mode = @scheduleMode,
          updated_at = SYSUTCDATETIME()
      WHERE company_id = @companyId AND id = @operationId
    `);
  if ((result.rowsAffected[0] ?? 0) === 0) {
    throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
  }
};

/**
 * Close historical SINGLE assignment and create a new MULTI assignment on shift S.
 * Never mutates operation_shift_id in place (preserves pre-transition history).
 */
const redistributeAssignmentToShiftInTransaction = async (
  companyId: string,
  assignment: Awaited<
    ReturnType<typeof operationEmployeeRepository.listByOperationInTransaction>
  >[number],
  operationShiftId: string,
  effectiveFrom: string,
  transaction: sql.Transaction,
): Promise<void> => {
  if (assignment.validFrom >= effectiveFrom) {
    const cancelled = await operationEmployeeRepository.cancelAssignmentInTransaction(
      companyId,
      transaction,
      assignment.id,
    );
    if (!cancelled) {
      throw new AppError(
        400,
        "ASSIGNMENT_NOT_FOUND",
        "Una de las asignaciones indicadas no existe o ya está cancelada.",
      );
    }
  } else {
    const dayBefore = addDaysToDateIso(effectiveFrom, -1);
    if (dayBefore < assignment.validFrom) {
      const cancelled = await operationEmployeeRepository.cancelAssignmentInTransaction(
        companyId,
        transaction,
        assignment.id,
      );
      if (!cancelled) {
        throw new AppError(
          400,
          "ASSIGNMENT_NOT_FOUND",
          "Una de las asignaciones indicadas no existe o ya está cancelada.",
        );
      }
    } else {
      const ended = await operationEmployeeRepository.updateValidityInTransaction(
        companyId,
        transaction,
        assignment.id,
        { validFrom: assignment.validFrom, validUntil: dayBefore },
      );
      if (!ended) {
        throw new AppError(
          400,
          "ASSIGNMENT_NOT_FOUND",
          "Una de las asignaciones indicadas no existe o ya está cancelada.",
        );
      }
    }
  }

  await operationEmployeeRepository.createInTransaction(companyId, transaction, {
    operationId: assignment.operationId,
    employeeId: assignment.employeeId,
    validFrom: effectiveFrom,
    validUntil: assignment.validUntil,
    sourceAssignmentBatchId: assignment.sourceAssignmentBatchId ?? null,
    sourceWorkTeamId: assignment.sourceWorkTeamId ?? null,
    assignmentOrigin: assignment.assignmentOrigin ?? "MANUAL",
    operationShiftId,
  });
};

const mapTransitionError = (error: unknown): never => {
  if (error instanceof AppError) {
    throw error;
  }
  if (error instanceof ShiftTimeError) {
    throw new AppError(400, error.code, error.message);
  }
  if (
    error instanceof Error &&
    (error.message === "INVALID_EFFECTIVE_FROM" ||
      error.message === "INVALID_EFFECTIVE_UNTIL" ||
      error.message === "EFFECTIVE_UNTIL_BEFORE_FROM")
  ) {
    throw new AppError(
      400,
      "INVALID_SHIFT_EFFECTIVE_RANGE",
      "El rango de vigencia del turno es inválido.",
    );
  }
  if (isDuplicateKeyError(error)) {
    throw new AppError(
      409,
      "OPERATION_SHIFT_CODE_EXISTS",
      "Ya existe un turno con ese código en la operación.",
    );
  }
  throw error;
};

type SeedMultiShiftInput = {
  code: string;
  name: string;
  templateId?: string | null;
  sortOrder?: number;
  startTime: string;
  endTime: string;
  effectiveUntil?: string | null;
  days?: TransitionToMultiShiftInput["shifts"][number]["days"];
};

/**
 * Seeds MULTI_SHIFT catalog + mode for a newly created operation (no assignment redistribution).
 * Intended for create-time atomic use inside an open transaction.
 */
export const seedMultiShiftOnCreateInTransaction = async (
  companyId: string,
  operationId: string,
  effectiveFrom: string,
  shifts: SeedMultiShiftInput[],
  transaction: sql.Transaction,
): Promise<string[]> => {
  if (!shifts || shifts.length < 1) {
    throw new AppError(
      400,
      "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
      "Se requiere al menos un turno para crear en modo multi-turno.",
    );
  }

  const createdShiftIds: string[] = [];
  for (const shiftInput of shifts) {
    const code = normalizeShiftCode(shiftInput.code || shiftInput.name);
    const name = shiftInput.name.trim();
    if (!name) {
      throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
    }
    const startTime = normalizeShiftTime(shiftInput.startTime);
    const endTime = normalizeShiftTime(shiftInput.endTime);
    assertShiftTimesDistinct(startTime, endTime);
    assertEffectiveRange(effectiveFrom, shiftInput.effectiveUntil ?? null);

    const shift = await operationShiftRepository.createIdentityInTransaction(
      companyId,
      transaction,
      {
        operationId,
        templateId: shiftInput.templateId ?? null,
        code,
        name,
        sortOrder: shiftInput.sortOrder ?? 0,
        isActive: true,
      },
    );

    await operationShiftVersionRepository.createWithOverlapGuard(
      companyId,
      shift.id,
      {
        effectiveFrom,
        effectiveUntil: shiftInput.effectiveUntil ?? null,
        startTime,
        endTime,
        days: shiftInput.days,
      },
      transaction,
    );

    createdShiftIds.push(shift.id);
  }

  await updateScheduleModeInTransaction(companyId, operationId, "MULTI_SHIFT", transaction);
  return createdShiftIds;
};

/**
 * Transitions scheduled_operations.schedule_mode between SINGLE and MULTI_SHIFT.
 * Does not auto-assign every employee to every shift.
 */
export const operationScheduleModeTransitionService = {
  async transitionToMultiShift(
    companyId: string,
    operationId: string,
    input: TransitionToMultiShiftInput,
  ): Promise<{ scheduleMode: "MULTI_SHIFT"; shiftIds: string[] }> {
    await assertActiveCompany(companyId);
    await assertEffectiveFromIsToday(companyId, input.effectiveFrom);

    if (!input.shifts || input.shifts.length < 1) {
      throw new AppError(
        400,
        "SHIFT_REQUIRED_FOR_MULTI_SHIFT_MODE",
        "Se requiere al menos un turno para pasar a modo multi-turno.",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const operation = await operationRepository.findByIdForUpdate(
        companyId,
        operationId,
        transaction,
      );
      if (!operation) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
      }
      if (operation.scheduleMode === "MULTI_SHIFT") {
        throw new AppError(
          409,
          "ALREADY_MULTI_SHIFT",
          "La operación ya está en modo multi-turno.",
        );
      }

      const activeAssignments = (
        await operationEmployeeRepository.listByOperationInTransaction(
          companyId,
          operationId,
          transaction,
        )
      ).filter((assignment) => {
        if (assignment.validUntil != null && assignment.validUntil < input.effectiveFrom) {
          return false;
        }
        return assignment.operationShiftId == null;
      });

      // Active/future SINGLE assignments always require complete explicit distribution.
      if (activeAssignments.length > 0) {
        const distributed = new Set<string>();
        for (const shift of input.shifts) {
          for (const assignmentId of shift.assignmentIds ?? []) {
            if (distributed.has(assignmentId)) {
              throw new AppError(
                400,
                "ASSIGNMENT_DISTRIBUTION_REQUIRED",
                "Cada asignación activa debe distribuirse a un único turno.",
              );
            }
            distributed.add(assignmentId);
          }
        }

        const activeIds = new Set(activeAssignments.map((row) => row.id));
        for (const assignmentId of distributed) {
          if (!activeIds.has(assignmentId)) {
            throw new AppError(
              400,
              "ASSIGNMENT_DISTRIBUTION_REQUIRED",
              "La distribución incluye asignaciones que no están activas en modo simple.",
            );
          }
        }
        if (distributed.size !== activeIds.size) {
          throw new AppError(
            400,
            "ASSIGNMENT_DISTRIBUTION_REQUIRED",
            "Debés distribuir explícitamente todas las asignaciones activas a los turnos.",
          );
        }
      }

      // Catalog rows may exist while still SINGLE; productive assignment writes wait until MULTI.
      const createdShiftIds: string[] = [];
      const shiftIdByIndex: string[] = [];
      const assignmentById = new Map(activeAssignments.map((row) => [row.id, row]));

      for (const shiftInput of input.shifts) {
        const code = normalizeShiftCode(shiftInput.code || shiftInput.name);
        const name = shiftInput.name.trim();
        if (!name) {
          throw new AppError(400, "SHIFT_NAME_REQUIRED", "El nombre del turno es obligatorio.");
        }
        const startTime = normalizeShiftTime(shiftInput.startTime);
        const endTime = normalizeShiftTime(shiftInput.endTime);
        assertShiftTimesDistinct(startTime, endTime);
        assertEffectiveRange(input.effectiveFrom, shiftInput.effectiveUntil ?? null);

        const shift = await operationShiftRepository.createIdentityInTransaction(
          companyId,
          transaction,
          {
            operationId,
            templateId: shiftInput.templateId ?? null,
            code,
            name,
            sortOrder: shiftInput.sortOrder ?? 0,
            isActive: true,
          },
        );

        await operationShiftVersionRepository.createWithOverlapGuard(
          companyId,
          shift.id,
          {
            effectiveFrom: input.effectiveFrom,
            effectiveUntil: shiftInput.effectiveUntil ?? null,
            startTime,
            endTime,
            days: shiftInput.days,
          },
          transaction,
        );

        createdShiftIds.push(shift.id);
        shiftIdByIndex.push(shift.id);
      }

      // Flip mode before creating shift-bound assignments so assertAssignmentWriteAllowed passes.
      await updateScheduleModeInTransaction(companyId, operationId, "MULTI_SHIFT", transaction);

      for (let index = 0; index < input.shifts.length; index += 1) {
        const shiftInput = input.shifts[index]!;
        const shiftId = shiftIdByIndex[index]!;
        for (const assignmentId of shiftInput.assignmentIds ?? []) {
          const assignment = assignmentById.get(assignmentId);
          if (!assignment) {
            throw new AppError(
              400,
              "ASSIGNMENT_DISTRIBUTION_REQUIRED",
              "La distribución incluye asignaciones que no están activas en modo simple.",
            );
          }
          await redistributeAssignmentToShiftInTransaction(
            companyId,
            assignment,
            shiftId,
            input.effectiveFrom,
            transaction,
          );
        }
      }

      await transaction.commit();
      return { scheduleMode: "MULTI_SHIFT", shiftIds: createdShiftIds };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // already aborted
      }
      return mapTransitionError(error);
    }
  },

  async transitionToSingle(
    companyId: string,
    operationId: string,
    input: TransitionToSingleInput,
  ): Promise<{ scheduleMode: "SINGLE" }> {
    await assertActiveCompany(companyId);
    await assertEffectiveFromIsToday(companyId, input.effectiveFrom);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

    try {
      const operation = await operationRepository.findByIdForUpdate(
        companyId,
        operationId,
        transaction,
      );
      if (!operation) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada.");
      }
      if (operation.scheduleMode !== "MULTI_SHIFT") {
        throw new AppError(
          409,
          "NOT_MULTI_SHIFT",
          "La operación no está en modo multi-turno.",
        );
      }

      const workdays = await operationWorkdayRepository.listByOperationIdInTransaction(
        companyId,
        transaction,
        operationId,
      );
      const futureMultiWorkdays = workdays.filter(
        (row) =>
          row.operationShiftId != null &&
          row.workDate >= input.effectiveFrom &&
          row.status === "ACTIVE",
      );
      if (futureMultiWorkdays.length > 0) {
        throw new AppError(
          409,
          "MULTI_WORKDAYS_BLOCK_SINGLE_TRANSITION",
          "Hay jornadas multi-turno futuras activas que impiden volver a modo simple.",
        );
      }

      const assignments = await operationEmployeeRepository.listByOperationInTransaction(
        companyId,
        operationId,
        transaction,
      );
      const unresolvedShiftAssignments = assignments.filter((assignment) => {
        if (assignment.operationShiftId == null) {
          return false;
        }
        if (assignment.validUntil != null && assignment.validUntil < input.effectiveFrom) {
          return false;
        }
        return true;
      });
      if (unresolvedShiftAssignments.length > 0) {
        throw new AppError(
          409,
          "SHIFT_ASSIGNMENTS_BLOCK_SINGLE_TRANSITION",
          "Hay asignaciones con turno sin resolver después de la fecha de vigencia.",
        );
      }

      // Historical shifts/workdays are retained; only the mode flag changes.
      await updateScheduleModeInTransaction(companyId, operationId, "SINGLE", transaction);
      await transaction.commit();
      return { scheduleMode: "SINGLE" };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // already aborted
      }
      throw error;
    }
  },
};
