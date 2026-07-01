import { AppError } from "../errors/app-error";
import { inventoryAttendanceRepository } from "../repositories/inventory-attendance.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import type {
  CreateInventoryInput,
  ListInventoriesQuery,
  UpdateInventoryInput,
} from "../schemas/inventory.schema";
import { auditService } from "./audit.service";
import { canTransitionInventoryStatus, isInventoryEditable } from "../utils/inventory-status";
import {
  isInventoryStartInPast,
  resolveLifecycleInventoryStatus,
} from "../utils/inventory-lifecycle";
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

type InventoryRecord = NonNullable<Awaited<ReturnType<typeof inventoryRepository.findById>>>;

const syncLifecycleStatus = async (
  companyId: string,
  inventory: InventoryRecord,
): Promise<InventoryRecord> => {
  const resolvedStatus = resolveLifecycleInventoryStatus(inventory);
  if (resolvedStatus === inventory.status || !canTransitionInventoryStatus(inventory.status, resolvedStatus)) {
    return inventory;
  }

  const updated = await inventoryRepository.update(companyId, inventory.id, { status: resolvedStatus });
  return updated ?? inventory;
};

export const inventoryService = {
  async create(companyId: string, input: CreateInventoryInput) {
    const store = await storeRepository.findById(companyId, input.storeId);
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    if (!store.active) {
      throw new AppError(409, "STORE_INACTIVE", "No se puede crear inventario para una tienda inactiva");
    }

    validateInventoryDates(input.scheduledStart, input.scheduledEnd);
    validateInventoryStartNotInPast(input.scheduledStart);
    return inventoryRepository.create(companyId, input);
  },

  async list(companyId: string, query: ListInventoriesQuery) {
    const result = await inventoryRepository.list(companyId, query);
    const data = await Promise.all(result.items.map((item) => syncLifecycleStatus(companyId, item)));
    return {
      data,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const inventory = await inventoryRepository.findById(companyId, id);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }
    return syncLifecycleStatus(companyId, inventory);
  },

  async getDetailById(companyId: string, id: string) {
    const detail = await inventoryRepository.findDetailById(companyId, id);
    if (!detail) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    const synced = await syncLifecycleStatus(companyId, detail);
    return {
      ...detail,
      ...synced,
    };
  },

  async update(companyId: string, id: string, input: UpdateInventoryInput) {
    const current = await this.getById(companyId, id);

    if (!isInventoryEditable(current.status)) {
      throw new AppError(
        409,
        "INVENTORY_NOT_EDITABLE",
        "No se puede modificar un inventario completado o cancelado",
      );
    }

    if (input.storeId) {
      const store = await storeRepository.findById(companyId, input.storeId);
      if (!store) {
        throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
      }
      if (!store.active) {
        throw new AppError(409, "STORE_INACTIVE", "No se puede asociar una tienda inactiva");
      }
    }

    if (input.status && !canTransitionInventoryStatus(current.status, input.status)) {
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

    const updated = await inventoryRepository.update(companyId, id, input);
    if (!updated) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    await auditService.log(companyId, {
      entityType: "inventory",
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
    if (!canTransitionInventoryStatus(current.status, "CANCELLED")) {
      throw new AppError(
        409,
        "INVALID_INVENTORY_STATUS_TRANSITION",
        "No se puede cancelar un inventario en este estado",
      );
    }

    const cancelled = await inventoryRepository.cancel(companyId, id);
    if (!cancelled) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    await auditService.log(companyId, {
      entityType: "inventory",
      entityId: id,
      action: "cancel",
      previousData: current as unknown as Record<string, unknown>,
      newData: cancelled as unknown as Record<string, unknown>,
      reason: "Cancelación vía API",
    });

    return cancelled;
  },

  async getAttendanceSummary(companyId: string, inventoryId: string, page = 1, limit = 10) {
    const summary = await inventoryAttendanceRepository.getAttendanceSummary(
      companyId,
      inventoryId,
      page,
      limit,
    );
    if (!summary) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    const syncedInventory = await syncLifecycleStatus(companyId, summary.inventory);

    return {
      inventory: {
        ...summary.inventory,
        ...syncedInventory,
        store: summary.store,
      },
      summary: summary.summary,
      employees: summary.employees,
      meta: buildPaginationMeta(page, limit, summary.total),
    };
  },
};
