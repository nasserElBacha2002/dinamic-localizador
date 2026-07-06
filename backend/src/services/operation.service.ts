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
  isInventoryStartInPast,
  resolveLifecycleOperationStatus,
} from "../utils/operation-lifecycle";
import { buildPaginationMeta } from "../utils/pagination";

const validateInventoryDates = (
  scheduledStart: string,
  scheduledEnd: string | null | undefined,
): void => {
  if (!scheduledEnd) {
    return;
  }
  if (new Date(scheduledEnd) <= new Date(scheduledStart)) {
    throw new AppError(
      400,
      "INVALID_INVENTORY_DATE_RANGE",
      "scheduledEnd debe ser posterior a scheduledStart",
    );
  }
};

const validateInventoryStartNotInPast = (scheduledStart: string): void => {
  if (isInventoryStartInPast(scheduledStart)) {
    throw new AppError(
      400,
      "INVENTORY_START_IN_PAST",
      "No se puede programar un inventario con fecha de inicio en el pasado",
    );
  }
};

type InventoryRecord = NonNullable<Awaited<ReturnType<typeof operationRepository.findById>>>;

const syncLifecycleStatus = async (
  companyId: string,
  inventory: InventoryRecord,
): Promise<InventoryRecord> => {
  const resolvedStatus = resolveLifecycleOperationStatus(inventory);
  if (resolvedStatus === inventory.status || !canTransitionOperationStatus(inventory.status, resolvedStatus)) {
    return inventory;
  }

  const updated = await operationRepository.update(companyId, inventory.id, { status: resolvedStatus });
  return updated ?? inventory;
};

type ResolvedCreateOperationInput = CreateOperationInput & {
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
};

const resolveCreateOperationInput = async (
  companyId: string,
  input: CreateOperationInput,
): Promise<ResolvedCreateOperationInput> => {
  const inventoryDefaults =
    await companyOperationalDefaultsResolver.getInventoryDefaults(companyId);

  return {
    ...input,
    earlyToleranceMinutes:
      input.earlyToleranceMinutes ?? inventoryDefaults.earlyToleranceMinutes,
    lateToleranceMinutes: input.lateToleranceMinutes ?? inventoryDefaults.lateToleranceMinutes,
  };
};

export const operationService = {
  async create(companyId: string, input: CreateOperationInput) {
    const store = await serviceRepository.findById(companyId, input.serviceId);
    if (!store) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Tienda no encontrada");
    }
    if (!store.active) {
      throw new AppError(409, "STORE_INACTIVE", "No se puede crear inventario para una tienda inactiva");
    }

    validateInventoryDates(input.scheduledStart, input.scheduledEnd);
    validateInventoryStartNotInPast(input.scheduledStart);

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
    const inventory = await operationRepository.findById(companyId, id);
    if (!inventory) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
    }
    return syncLifecycleStatus(companyId, inventory);
  },

  async getDetailById(companyId: string, id: string) {
    const detail = await operationRepository.findDetailById(companyId, id);
    if (!detail) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
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
        "INVENTORY_NOT_EDITABLE",
        "No se puede modificar un inventario completado o cancelado",
      );
    }

    if (input.serviceId) {
      const store = await serviceRepository.findById(companyId, input.serviceId);
      if (!store) {
        throw new AppError(404, "SERVICE_NOT_FOUND", "Tienda no encontrada");
      }
      if (!store.active) {
        throw new AppError(409, "STORE_INACTIVE", "No se puede asociar una tienda inactiva");
      }
    }

    if (input.status && !canTransitionOperationStatus(current.status, input.status)) {
      throw new AppError(
        409,
        "INVALID_INVENTORY_STATUS_TRANSITION",
        "Transición de estado de inventario no permitida",
      );
    }

    validateInventoryDates(
      input.scheduledStart ?? current.scheduledStart,
      input.scheduledEnd === undefined ? current.scheduledEnd : input.scheduledEnd,
    );

    if (input.scheduledStart && input.scheduledStart !== current.scheduledStart) {
      validateInventoryStartNotInPast(input.scheduledStart);
    }

    const scheduleChanged =
      input.scheduledStart !== undefined &&
      new Date(input.scheduledStart).getTime() !== new Date(current.scheduledStart).getTime();

    let updated: InventoryRecord | null;
    let resetCount = 0;

    if (scheduleChanged) {
      const pool = getPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        updated = await operationRepository.update(companyId, id, input, transaction);
        if (!updated) {
          throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
        }

        resetCount = await employeeAssignmentQueryRepository.resetConfirmationsForInventoryScheduleChange(
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
        throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
      }
    }

    if (resetCount > 0) {
      console.info("[inventory] confirmation state reset after schedule change", {
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
        "INVALID_INVENTORY_STATUS_TRANSITION",
        "No se puede cancelar un inventario en este estado",
      );
    }

    const cancelled = await operationRepository.cancel(companyId, id);
    if (!cancelled) {
      throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
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
      throw new AppError(404, "OPERATION_NOT_FOUND", "Inventario no encontrado");
    }

    const syncedOperation = await syncLifecycleStatus(companyId, summary.inventory);

    return {
      inventory: {
        ...summary.inventory,
        ...syncedOperation,
        store: summary.store,
      },
      summary: summary.summary,
      employees: summary.employees,
      meta: buildPaginationMeta(page, limit, summary.total),
    };
  },
};
