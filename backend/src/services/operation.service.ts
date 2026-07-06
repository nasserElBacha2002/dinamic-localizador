// Operational domain: Operation maps to scheduled_operations; Service maps to operational_locations.
// Product-facing UI may refer to a ScheduledOperation / Operación.
import { AppError } from "../errors/app-error";
import sql from "mssql";
import { getPool } from "../database/connection";
import { operationAttendanceRepository } from "../repositories/operation-attendance.repository";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { operationRepository } from "../repositories/operation.repository";
import { serviceRepository } from "../repositories/service.repository";
import type {
  CreateOperationInput,
  ListOperationsQuery,
  UpdateOperationInput,
} from "../schemas/operation.schema";
import { auditService } from "./audit.service";
import { companyOperationalDefaultsResolver } from "./company-operational-defaults.resolver";
import { canTransitionOperationStatus, isOperationEditable } from "../utils/operation-status";
import {
  isOperationStartInPast,
  resolveLifecycleOperationStatus,
} from "../utils/operation-lifecycle";
import { buildPaginationMeta } from "../utils/pagination";

const validateOperationDates = (
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

type ResolvedCreateOperationInput = CreateOperationInput & {
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

const resolveCreateOperationInput = async (
  companyId: string,
  input: CreateOperationInput,
): Promise<ResolvedCreateOperationInput> => {
  const operationDefaults =
    await companyOperationalDefaultsResolver.getOperationDefaults(companyId);

  return {
    ...input,
    earlyToleranceMinutes:
      input.earlyToleranceMinutes ?? operationDefaults.earlyToleranceMinutes,
    lateToleranceMinutes: input.lateToleranceMinutes ?? operationDefaults.lateToleranceMinutes,
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

    validateOperationDates(input.scheduledStart, input.scheduledEnd);
    validateOperationStartNotInPast(input.scheduledStart);

    const resolvedInput = await resolveCreateOperationInput(companyId, input);
    return operationRepository.create(companyId, resolvedInput);
  },

  async list(companyId: string, query: ListOperationsQuery) {
    const result = await operationRepository.list(companyId, query);
    const data = await Promise.all(result.items.map((item) => syncLifecycleStatus(companyId, item)));
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
    const detail = await operationRepository.findDetailById(companyId, id);
    if (!detail) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Operación no encontrada");
    }

    const synced = await syncLifecycleStatus(companyId, detail);
    return {
      ...detail,
      ...synced,
    };
  },

  async update(companyId: string, id: string, input: UpdateOperationInput) {
    const current = await this.getById(companyId, id);

    if (!isOperationEditable(current.status)) {
      throw new AppError(
        409,
        "OPERATION_NOT_EDITABLE",
        "No se puede modificar una operación completada o cancelada",
      );
    }

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

    validateOperationDates(
      input.scheduledStart ?? current.scheduledStart,
      input.scheduledEnd === undefined ? current.scheduledEnd : input.scheduledEnd,
    );

    if (input.scheduledStart && input.scheduledStart !== current.scheduledStart) {
      validateOperationStartNotInPast(input.scheduledStart);
    }

    const scheduleChanged =
      input.scheduledStart !== undefined &&
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

  async cancel(companyId: string, id: string) {
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
      previousData: current as unknown as Record<string, unknown>,
      newData: cancelled as unknown as Record<string, unknown>,
      reason: "Cancelación vía API",
    });

    return cancelled;
  },

  async getAttendanceSummary(companyId: string, operationId: string, page = 1, limit = 10) {
    const summary = await operationAttendanceRepository.getAttendanceSummary(
      companyId,
      operationId,
      page,
      limit,
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
      summary: summary.summary,
      employees: summary.employees,
      meta: buildPaginationMeta(page, limit, summary.total),
    };
  },
};
