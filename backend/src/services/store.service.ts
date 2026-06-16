import { AppError } from "../errors/app-error";
import { storeRepository } from "../repositories/store.repository";
import type { CreateStoreInput, ListStoresQuery, UpdateStoreInput } from "../schemas/store.schema";
import { buildPaginationMeta } from "../utils/pagination";

export const storeService = {
  async create(input: CreateStoreInput) {
    return storeRepository.create({
      ...input,
      name: input.name.trim(),
      address: input.address?.trim() ?? null,
    });
  },

  async list(query: ListStoresQuery) {
    const result = await storeRepository.list(query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(id: string) {
    const store = await storeRepository.findById(id);
    if (!store) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return store;
  },

  async update(id: string, input: UpdateStoreInput) {
    await this.getById(id);

    if (input.active === false) {
      const hasSchedules = await storeRepository.hasActiveOrScheduledInventories(id);
      if (hasSchedules) {
        throw new AppError(
          409,
          "STORE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
          "No se puede desactivar una tienda con inventarios activos o programados",
        );
      }
    }

    const updated = await storeRepository.update(id, input);
    if (!updated) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return updated;
  },

  async deactivate(id: string) {
    await this.getById(id);
    const hasSchedules = await storeRepository.hasActiveOrScheduledInventories(id);
    if (hasSchedules) {
      throw new AppError(
        409,
        "STORE_HAS_ACTIVE_OR_SCHEDULED_INVENTORIES",
        "No se puede desactivar una tienda con inventarios activos o programados",
      );
    }

    const updated = await storeRepository.deactivate(id);
    if (!updated) {
      throw new AppError(404, "STORE_NOT_FOUND", "Tienda no encontrada");
    }
    return updated;
  },
};
