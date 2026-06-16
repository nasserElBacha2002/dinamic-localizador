import { AppError } from "../errors/app-error";
import { inventoryAttendanceRepository } from "../repositories/inventory-attendance.repository";
import { inventoryRepository } from "../repositories/inventory.repository";
import { storeRepository } from "../repositories/store.repository";
import type {
  CreateInventoryInput,
  ListInventoriesQuery,
  UpdateInventoryInput,
} from "../schemas/inventory.schema";
import { auditRepository } from "../repositories/audit.repository";
import { canTransitionInventoryStatus, isInventoryEditable } from "../utils/inventory-status";
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

export const inventoryService = {
  async create(input: CreateInventoryInput) {
    const store = await storeRepository.findById(input.storeId);
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    if (!store.active) {
      throw new AppError(409, "STORE_INACTIVE", "No se puede crear inventario para una tienda inactiva");
    }

    validateInventoryDates(input.scheduledStart, input.scheduledEnd);
    return inventoryRepository.create(input);
  },

  async list(query: ListInventoriesQuery) {
    const result = await inventoryRepository.list(query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(id: string) {
    const inventory = await inventoryRepository.findById(id);
    if (!inventory) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }
    return inventory;
  },

  async getDetailById(id: string) {
    const detail = await inventoryRepository.findDetailById(id);
    if (!detail) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }
    return detail;
  },

  async update(id: string, input: UpdateInventoryInput) {
    const current = await this.getById(id);

    if (!isInventoryEditable(current.status)) {
      throw new AppError(
        409,
        "INVENTORY_NOT_EDITABLE",
        "No se puede modificar un inventario completado o cancelado",
      );
    }

    if (input.storeId) {
      const store = await storeRepository.findById(input.storeId);
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

    const updated = await inventoryRepository.update(id, input);
    if (!updated) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    await auditRepository.log({
      entityType: "inventory",
      entityId: id,
      action: "update",
      previousData: JSON.stringify(current),
      newData: JSON.stringify(updated),
      reason: "Actualización vía API",
    });

    return updated;
  },

  async cancel(id: string) {
    const current = await this.getById(id);
    if (!canTransitionInventoryStatus(current.status, "CANCELLED")) {
      throw new AppError(
        409,
        "INVALID_INVENTORY_STATUS_TRANSITION",
        "No se puede cancelar un inventario en este estado",
      );
    }

    const cancelled = await inventoryRepository.cancel(id);
    if (!cancelled) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    await auditRepository.log({
      entityType: "inventory",
      entityId: id,
      action: "cancel",
      previousData: JSON.stringify(current),
      newData: JSON.stringify(cancelled),
      reason: "Cancelación vía API",
    });

    return cancelled;
  },

  async getAttendanceSummary(inventoryId: string) {
    const summary = await inventoryAttendanceRepository.getAttendanceSummary(inventoryId);
    if (!summary) {
      throw new AppError(404, "INVENTORY_NOT_FOUND", "Inventario no encontrado");
    }

    const employees = summary.employees;
    const summaryCounts = {
      assigned: employees.length,
      checkedIn: employees.filter((row) => row.attendance !== null).length,
      valid: employees.filter((row) => row.operationalStatus === "VALID").length,
      pendingReview: employees.filter((row) => row.operationalStatus === "PENDING_REVIEW").length,
      rejected: employees.filter((row) => row.operationalStatus === "REJECTED").length,
      withoutCheckIn: employees.filter((row) => row.operationalStatus === "NO_CHECK_IN").length,
    };

    return {
      inventory: {
        ...summary.inventory,
        store: summary.store,
      },
      summary: summaryCounts,
      employees,
    };
  },
};
