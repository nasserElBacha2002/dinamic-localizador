import { AppError } from "../errors/app-error";
import { serviceRepository } from "../repositories/service.repository";
import type { CreateServiceInput, ListServicesQuery, UpdateServiceInput } from "../schemas/service.schema";
import { buildPaginationMeta } from "../utils/pagination";
import { companyLocationTypesService } from "./company-location-types.service";

export const serviceService = {
  async create(companyId: string, input: CreateServiceInput) {
    await companyLocationTypesService.assertActiveServiceFormat(companyId, input.serviceFormat);

    return serviceRepository.create(companyId, {
      ...input,
      name: input.name.trim(),
      address: input.address?.trim() ?? null,
      serviceFormat: input.serviceFormat?.trim() ?? null,
    });
  },

  async list(companyId: string, query: ListServicesQuery) {
    const result = await serviceRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(companyId: string, id: string) {
    const service = await serviceRepository.findById(companyId, id);
    if (!service) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
    }
    return service;
  },

  async update(companyId: string, id: string, input: UpdateServiceInput) {
    await this.getById(companyId, id);

    if (input.serviceFormat !== undefined) {
      await companyLocationTypesService.assertActiveServiceFormat(companyId, input.serviceFormat);
    }

    if (input.active === false) {
      const hasSchedules = await serviceRepository.hasActiveOrScheduledOperations(companyId, id);
      if (hasSchedules) {
        throw new AppError(
          409,
          "SERVICE_HAS_ACTIVE_OR_SCHEDULED_OPERATIONS",
          "No se puede desactivar un servicio con operaciones activas o programadas",
        );
      }
    }

    const updated = await serviceRepository.update(companyId, id, {
      ...input,
      serviceFormat:
        input.serviceFormat !== undefined ? input.serviceFormat?.trim() ?? null : undefined,
    });
    if (!updated) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
    }
    return updated;
  },

  async deactivate(companyId: string, id: string) {
    await this.getById(companyId, id);
    const hasSchedules = await serviceRepository.hasActiveOrScheduledOperations(companyId, id);
    if (hasSchedules) {
      throw new AppError(
        409,
        "SERVICE_HAS_ACTIVE_OR_SCHEDULED_OPERATIONS",
        "No se puede desactivar un servicio con operaciones activas o programadas",
      );
    }

    const updated = await serviceRepository.deactivate(companyId, id);
    if (!updated) {
      throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
    }
    return updated;
  },
};
