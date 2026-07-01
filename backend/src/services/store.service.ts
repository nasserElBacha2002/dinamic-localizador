import { AppError } from "../errors/app-error";
import { storeRepository } from "../repositories/store.repository";
import type { CreateStoreInput, ListStoresQuery, UpdateStoreInput } from "../schemas/store.schema";
import { buildPaginationMeta } from "../utils/pagination";

export const storeService = {
  async create(companyId: string, input: CreateStoreInput) {
    return storeRepository.create(companyId, {
      ...input,
      name: input.name.trim(),
      address: input.address?.trim() ?? null,
    });
  },

  async list(companyId: string, query: ListStoresQuery) {
    const result = await storeRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const store = await storeRepository.findById(companyId, id);
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return store;
  },

  async update(companyId: string, id: string, input: UpdateStoreInput) {
    await this.getById(companyId, id);

    if (input.active === false) {
      const hasSchedules = await storeRepository.hasActiveOrScheduledInventories(companyId, id);
      if (hasSchedules) {
        throw new AppError(
          409,
          "STORE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
          "No se puede desactivar una tienda con inventarios activos o programados",
        );
      }
    }

    const updated = await storeRepository.update(companyId, id, input);
    if (!updated) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return updated;
  },

  async deactivate(companyId: string, id: string) {
    await this.getById(companyId, id);
    const hasSchedules = await storeRepository.hasActiveOrScheduledInventories(companyId, id);
    if (hasSchedules) {
      throw new AppError(
        409,
        "STORE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
        "No se puede desactivar una tienda con inventarios activos o programados",
      );
    }

    const updated = await storeRepository.deactivate(companyId, id);
    if (!updated) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return updated;
  },
};
