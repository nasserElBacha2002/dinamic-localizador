// Operational domain: Operation maps to scheduled_operations; Service maps to operational_locations.
import { AppError } from "../errors/app-error";
import sql from "mssql";
import { getPool } from "../database/connection";
import { operationAttendanceRepository } from "../repositories/operation-attendance.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { operationRepository } from "../repositories/operation.repository";
import { operationScheduleRepository } from "../repositories/operation-schedule.repository";
import { serviceRepository } from "../repositories/service.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type {
  CreateOperationInput,
  CreateOneTimeOperationInput,
  CreateRecurringOperationInput,
  ListOperationsQuery,
  UpdateOperationInput,
} from "../schemas/operation.schema";
import { auditService } from "./audit.service";
import { companyOperationalDefaultsResolver } from "./company-operational-defaults.resolver";
import { companyWorkScheduleRepository } from "../repositories/company-work-schedule.repository";
import { recurringScheduleService } from "./recurring-schedule.service";
import { recurringWorkdayMaterializationService } from "./recurring-workday-materialization.service";
import { recurringWorkdaySyncService } from "./recurring-workday-sync.service";
import { operationScheduleSummaryService } from "./operation-schedule-summary.service";
import { canTransitionOperationStatus, isOperationEditable, isOperationReactivatable, OPERATION_REACTIVATION_STATUS } from "../utils/operation-status";
import {
  isOperationStartInPast,
  resolveLifecycleOperationStatus,
} from "../utils/operation-lifecycle";
import { buildPaginationMeta } from "../utils/pagination";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import { getDateIsoInTimezone } from "../utils/absence-date";
import {
  normalizeWeeklyScheduleDays,
  validateWeeklyScheduleDays,
  weeklySchedulesEqual,
} from "../utils/weekly-schedule";
import type { OperationDetail, OperationWithService } from "../types/domain";
import { assertCompanyWorkScheduleExists } from "../utils/recurring-schedule-consistency";

const validateOneTimeDates = (
  scheduledStart: string,
  scheduledEnd: string | null | undefined,
): void => {
  if (!scheduledEnd) {
    return;
  }
  if (new Date(scheduledEnd) <= new Date(scheduledStart)) {
    throw new AppError(
      400,
      "INVALID_OPERATION_DATE_RANGE",
      "scheduledEnd debe ser posterior a scheduledStart",
    );
  }
};

const validateOperationStartNotInPast = (scheduledStart: string): void => {
  if (isOperationStartInPast(scheduledStart)) {
    throw new AppError(
      400,
      "OPERATION_START_IN_PAST",
      "No se puede programar una operación con fecha de inicio en el pasado",
    );
  }
};

type OperationRecord = NonNullable<Awaited<ReturnType<typeof operationRepository.findById>>>;

const syncLifecycleStatus = async (
  companyId: string,
  operation: OperationRecord,
): Promise<OperationRecord> => {
  const resolvedStatus = resolveLifecycleOperationStatus(operation);
  if (resolvedStatus === operation.status || !canTransitionOperationStatus(operation.status, resolvedStatus)) {
    return operation;
  }

  const updated = await operationRepository.update(companyId, operation.id, { status: resolvedStatus });
  return updated ?? operation;
};

const resolveCreateTolerances = async (
  companyId: string,
  input: Pick<CreateOperationInput, "earlyToleranceMinutes" | "lateToleranceMinutes">,
) => {
  const operationDefaults =
    await companyOperationalDefaultsResolver.getOperationDefaults(companyId);

  return {
    earlyToleranceMinutes:
      input.earlyToleranceMinutes ?? operationDefaults.earlyToleranceMinutes,
    lateToleranceMinutes: input.lateToleranceMinutes ?? operationDefaults.lateToleranceMinutes,
  };
};

const enrichOperationDetail = async (
  companyId: string,
  detail: OperationDetail,
): Promise<OperationDetail> => {
  if (detail.operationKind !== "RECURRING") {
    return detail;
  }

  const schedule = await operationScheduleRepository.findByOperationId(companyId, detail.id);
  if (!schedule) {
    throw new AppError(
      409,
      "RECURRING_SCHEDULE_DATA_INCONSISTENT",
      "La operación habitual no tiene configuración de horario",
    );
  }

  const companySchedule =
    schedule.scheduleSource === "COMPANY"
      ? await companyWorkScheduleRepository.findByCompanyId(companyId)
      : null;
  recurringScheduleService.assertScheduleConsistency(detail.id, schedule, companySchedule);

  const effectiveSchedule = await recurringScheduleService.resolveEffectiveSchedule(
    companyId,
    schedule,
    companySchedule,
  );

  return {
    ...detail,
    schedule: recurringScheduleService.buildDisplaySchedule(schedule, effectiveSchedule),
  };
};

export const operationService = {
  async create(companyId: string, input: CreateOperationInput) {
    const service = await serviceRepository.findById(companyId, input.serviceId);
    if (!service) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
    }
    if (!service.active) {
      throw new AppError(409, "SERVICE_INACTIVE", "No se puede crear operación para un servicio inactivo");
    }

    const tolerances = await resolveCreateTolerances(companyId, input);

    if (input.operationKind === "ONE_TIME") {
      return this.createOneTime(companyId, input, tolerances);
    }

    return this.createRecurring(companyId, input, tolerances);
  },

  async createOneTime(
    companyId: string,
    input: CreateOneTimeOperationInput,
    tolerances: { earlyToleranceMinutes: number; lateToleranceMinutes: number },
  ) {
    validateOneTimeDates(input.scheduledStart, input.scheduledEnd);
    validateOperationStartNotInPast(input.scheduledStart);

    return operationRepository.create(companyId, {
      ...input,
      ...tolerances,
    });
  },

  async createRecurring(
    companyId: string,
    input: CreateRecurringOperationInput,
    tolerances: { earlyToleranceMinutes: number; lateToleranceMinutes: number },
  ) {
    if (input.scheduleSource === "COMPANY") {
      assertCompanyWorkScheduleExists(await companyWorkScheduleRepository.findByCompanyId(companyId));
    }

    if (input.scheduleSource === "CUSTOM") {
      const normalizedDays = normalizeWeeklyScheduleDays(input.scheduleDays ?? []);
      const validation = validateWeeklyScheduleDays(normalizedDays);
      if (!validation.valid) {
        throw new AppError(400, validation.code, validation.message);
      }
    }

    const settings = await companySettingsRepository.findByCompanyId(companyId);
    const customTimezone = resolveOperationTimezone(settings?.operationTimezone);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const operation = await operationRepository.createRecurring(
        companyId,
        {
          serviceId: input.serviceId,
          earlyToleranceMinutes: tolerances.earlyToleranceMinutes,
          lateToleranceMinutes: tolerances.lateToleranceMinutes,
          notes: input.notes ?? null,
        },
        transaction,
      );

      await operationScheduleRepository.createInTransaction(companyId, transaction, {
        operationId: operation.id,
        scheduleSource: input.scheduleSource,
        timezone: input.scheduleSource === "CUSTOM" ? customTimezone : null,
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        days:
          input.scheduleSource === "CUSTOM"
            ? normalizeWeeklyScheduleDays(input.scheduleDays ?? [])
            : undefined,
      });

      await transaction.commit();

      await recurringWorkdaySyncService.runOperationSync(
        companyId,
        operation.id,
        () => recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, operation.id),
        "recurring operation create",
      );

      return operation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async list(companyId: string, query: ListOperationsQuery) {
    const result = await operationRepository.list(companyId, query);
    const syncedItems: OperationWithService[] = await Promise.all(
      result.items.map(async (item) => {
        const synced = await syncLifecycleStatus(companyId, item);
        return { ...item, ...synced };
      }),
    );
    const scheduleSummaries = await operationScheduleSummaryService.buildSummariesForOperations(
      companyId,
      syncedItems,
    );

    const data = syncedItems.map((item) => ({
      ...item,
      scheduleSummary: scheduleSummaries.get(item.id),
    }));

    return {
      data,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const operation = await operationRepository.findById(companyId, id);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }
    return syncLifecycleStatus(companyId, operation);
  },

  async getDetailById(companyId: string, id: string) {
    const operation = await operationRepository.findById(companyId, id);
    if (!operation) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    let assignmentReferenceDate: string | null = null;
    if (operation.operationKind === "RECURRING") {
      const schedule = await operationScheduleRepository.findByOperationId(companyId, id);
      if (schedule) {
        const companySchedule =
          schedule.scheduleSource === "COMPANY"
            ? await companyWorkScheduleRepository.findByCompanyId(companyId)
            : null;
        const effectiveSchedule = await recurringScheduleService.resolveEffectiveSchedule(
          companyId,
          schedule,
          companySchedule,
        );
        assignmentReferenceDate = getDateIsoInTimezone(new Date(), effectiveSchedule.timezone);
      }
    }

    const detail = await operationRepository.findDetailById(
      companyId,
      id,
      assignmentReferenceDate,
    );
    if (!detail) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const synced = await syncLifecycleStatus(companyId, detail);
    return enrichOperationDetail(companyId, {
      ...detail,
      ...synced,
    });
  },

  async update(companyId: string, id: string, input: UpdateOperationInput) {
    const current = await this.getById(companyId, id);

    if (input.operationKind !== undefined) {
      throw new AppError(
        409,
        "OPERATION_KIND_IMMUTABLE",
        "El tipo de operación no puede modificarse después de crearla",
      );
    }

    if (!isOperationEditable(current.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_EDITABLE",
        "No se puede modificar una operación completada o cancelada",
      );
    }

    if (current.operationKind === "RECURRING") {
      if (input.scheduledStart !== undefined || input.scheduledEnd !== undefined) {
        throw new AppError(
          400,
          "INVALID_OPERATION_SCHEDULE_FIELDS",
          "Las operaciones habituales no usan inicio y fin programados",
        );
      }
      return this.updateRecurring(companyId, id, current, input);
    }

    return this.updateOneTime(companyId, id, current, input);
  },

  async updateOneTime(
    companyId: string,
    id: string,
    current: OperationRecord,
    input: UpdateOperationInput,
  ) {
    if (input.serviceId) {
      const service = await serviceRepository.findById(companyId, input.serviceId);
      if (!service) {
        throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
      }
      if (!service.active) {
        throw new AppError(409, "SERVICE_INACTIVE", "No se puede asociar un servicio inactivo");
      }
    }

    if (input.status && !canTransitionOperationStatus(current.status, input.status)) {
      throw new AppError(
        409,
        "INVALID_OPERATION_STATUS_TRANSITION",
        "Transición de estado de operación no permitida",
      );
    }

    const nextStart = input.scheduledStart ?? current.scheduledStart;
    if (!nextStart) {
      throw new AppError(400, "OPERATION_SCHEDULE_REQUIRED", "La operación requiere fecha de inicio");
    }

    validateOneTimeDates(
      nextStart,
      input.scheduledEnd === undefined ? current.scheduledEnd : input.scheduledEnd,
    );

    if (input.scheduledStart && input.scheduledStart !== current.scheduledStart) {
      validateOperationStartNotInPast(input.scheduledStart);
    }

    const scheduleChanged =
      input.scheduledStart !== undefined &&
      current.scheduledStart &&
      new Date(input.scheduledStart).getTime() !== new Date(current.scheduledStart).getTime();

    let updated: OperationRecord | null;
    let resetCount = 0;

    if (scheduleChanged) {
      const pool = getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        updated = await operationRepository.update(companyId, id, input, transaction);
        if (!updated) {
          throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
        }

        resetCount = await employeeAssignmentQueryRepository.resetConfirmationsForOperationScheduleChange(
          companyId,
          id,
          transaction,
        );

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } else {
      updated = await operationRepository.update(companyId, id, input);
      if (!updated) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
      }
    }

    if (resetCount > 0) {
      console.info("[operation] confirmation state reset after schedule change", {
        companyId,
        operationId: id,
        resetAssignments: resetCount,
      });
    }

    await auditService.log(companyId, {
      entityType: "operation",
      entityId: id,
      action: "update",
      previousData: current as unknown as Record<string, unknown>,
      newData: updated as unknown as Record<string, unknown>,
      reason: "Actualización vía API",
    });

    return updated;
  },

  async updateRecurring(
    companyId: string,
    id: string,
    current: OperationRecord,
    input: UpdateOperationInput,
  ) {
    const schedule = await operationScheduleRepository.findByOperationId(companyId, id);
    if (!schedule) {
      throw new AppError(404, "OPERATION_SCHEDULE_NOT_FOUND", "La operación no tiene horario configurado");
    }

    if (input.scheduleSource === "COMPANY" && input.scheduleDays) {
      throw new AppError(400, "INVALID_SCHEDULE_SOURCE", "La configuración del horario no es válida");
    }

    const nextSource = input.scheduleSource ?? schedule.scheduleSource;
    if (nextSource === "COMPANY") {
      assertCompanyWorkScheduleExists(await companyWorkScheduleRepository.findByCompanyId(companyId));
    }

    if (input.scheduleSource === "CUSTOM" || schedule.scheduleSource === "CUSTOM") {
      const sourceForValidation = input.scheduleSource ?? schedule.scheduleSource;
      if (sourceForValidation === "CUSTOM") {
        const days = normalizeWeeklyScheduleDays(
          input.scheduleDays ?? (schedule.scheduleSource === "CUSTOM" ? schedule.days : []),
        );
        const validation = validateWeeklyScheduleDays(days);
        if (!validation.valid) {
          throw new AppError(400, validation.code, validation.message);
        }
      }
    }

    const nextValidFrom = input.validFrom ?? schedule.validFrom;
    const nextValidUntil =
      input.validUntil !== undefined ? input.validUntil : schedule.validUntil;
    if (nextValidUntil && nextValidUntil < nextValidFrom) {
      throw new AppError(
        400,
        "INVALID_OPERATION_VALIDITY_RANGE",
        "La fecha de finalización no puede ser anterior a la fecha de inicio",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const updatedOperation = await operationRepository.update(companyId, id, input, transaction);
      if (!updatedOperation) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
      }

      const resolvedNextSource = input.scheduleSource ?? schedule.scheduleSource;
      const settings = await companySettingsRepository.findByCompanyId(companyId);
      const customTimezone =
        schedule.timezone ?? resolveOperationTimezone(settings?.operationTimezone);
      const nextDays =
        resolvedNextSource === "CUSTOM"
          ? normalizeWeeklyScheduleDays(
              input.scheduleDays ?? (schedule.scheduleSource === "CUSTOM" ? schedule.days : []),
            )
          : undefined;

      const scheduleChanged =
        resolvedNextSource !== schedule.scheduleSource ||
        nextValidFrom !== schedule.validFrom ||
        nextValidUntil !== schedule.validUntil ||
        (resolvedNextSource === "CUSTOM" &&
          nextDays &&
          !weeklySchedulesEqual(nextDays, schedule.days));

      if (
        input.scheduleSource !== undefined ||
        input.validFrom !== undefined ||
        input.validUntil !== undefined ||
        input.scheduleDays !== undefined
      ) {
        await operationScheduleRepository.updateInTransaction(companyId, transaction, id, {
          scheduleSource: resolvedNextSource,
          timezone: resolvedNextSource === "CUSTOM" ? customTimezone : null,
          validFrom: nextValidFrom,
          validUntil: nextValidUntil,
          days: nextDays,
          nextVersion: scheduleChanged ? schedule.version + 1 : schedule.version,
        });
      }

      await transaction.commit();

      if (scheduleChanged) {
        await recurringWorkdaySyncService.runOperationSync(
          companyId,
          id,
          () => recurringWorkdayMaterializationService.materializeOperationHorizon(companyId, id),
          "recurring schedule update",
        );
      }

      return updatedOperation;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async cancel(companyId: string, id: string, userId?: string | null) {
    const current = await this.getById(companyId, id);
    if (!canTransitionOperationStatus(current.status, "CANCELLED")) {
      throw new AppError(
        409,
        "INVALID_OPERATION_STATUS_TRANSITION",
        "No se puede cancelar una operación en este estado",
      );
    }

    const cancelled = await operationRepository.cancel(companyId, id);
    if (!cancelled) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    await auditService.log(companyId, {
      entityType: "operation",
      entityId: id,
      action: "cancel",
      userId: userId ?? null,
      previousData: current as unknown as Record<string, unknown>,
      newData: cancelled as unknown as Record<string, unknown>,
      reason: "Cancelación vía API",
    });

    if ((cancelled.operationKind ?? "ONE_TIME") === "RECURRING") {
      await recurringWorkdaySyncService.runOperationSync(
        companyId,
        id,
        () =>
          recurringWorkdayMaterializationService.reconcileFutureWorkdaysForCancelledOperation(
            companyId,
            id,
          ),
        "recurring operation cancel",
      );
    }

    return cancelled;
  },

  async reactivate(companyId: string, id: string, userId?: string | null) {
    const current = await operationRepository.findById(companyId, id);
    if (!current) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    if (!isOperationReactivatable(current.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_CANCELLED",
        "La operación ya no se encuentra cancelada y no puede reactivarse.",
      );
    }

    if (!canTransitionOperationStatus(current.status, OPERATION_REACTIVATION_STATUS)) {
      throw new AppError(
        409,
        "INVALID_OPERATION_STATUS_TRANSITION",
        "No se puede reactivar una operación en este estado",
      );
    }

    const reactivated = await operationRepository.reactivateFromCancelled(companyId, id);
    if (!reactivated) {
      // Concurrent reactivation or status changed between read and update.
      const raced = await operationRepository.findById(companyId, id);
      if (!raced) {
        throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
      }
      throw new AppError(
        409,
        "OPERATION_NOT_CANCELLED",
        "La operación ya no se encuentra cancelada y no puede reactivarse.",
      );
    }

    await auditService.log(companyId, {
      entityType: "operation",
      entityId: id,
      action: "reactivate",
      userId: userId ?? null,
      previousData: {
        ...(current as unknown as Record<string, unknown>),
        previousStatus: current.status,
        restoredStatus: OPERATION_REACTIVATION_STATUS,
      },
      newData: reactivated as unknown as Record<string, unknown>,
      reason: "Reactivación vía API",
    });

    if ((reactivated.operationKind ?? "ONE_TIME") === "RECURRING") {
      await recurringWorkdaySyncService.runOperationSync(
        companyId,
        id,
        () =>
          recurringWorkdayMaterializationService.reconcileWorkdaysForReactivatedOperation(
            companyId,
            id,
          ),
        "recurring operation reactivate",
      );
    }

    return syncLifecycleStatus(companyId, reactivated);
  },

  async getAttendanceSummary(
    companyId: string,
    operationId: string,
    page = 1,
    limit = 10,
    search?: string,
    workDate?: string,
    workdayId?: string,
  ) {
    const summary = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operationId,
      page,
      limit,
      search,
      workDate,
      workdayId,
    );
    if (!summary) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const syncedOperation = await syncLifecycleStatus(companyId, summary.operation);

    return {
      operation: {
        ...summary.operation,
        ...syncedOperation,
        service: summary.service,
      },
      operationWorkdayId: summary.operationWorkdayId,
      workDate: summary.workDate,
      summary: summary.summary,
      employees: summary.employees,
      meta: buildPaginationMeta(page, limit, summary.total),
    };
  },
};
