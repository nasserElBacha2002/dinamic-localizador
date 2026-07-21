import { AppError } from "../errors/app-error";
import { serviceRepository } from "../repositories/service.repository";
import type { CreateServiceInput, ListServicesQuery, UpdateServiceInput } from "../schemas/service.schema";
import { buildPaginationMeta } from "../utils/pagination";
import { isOperationalLocationNameDuplicateKeyError } from "../utils/service-name-duplicate-errors";
import { companyLocationTypesService } from "./company-location-types.service";

const SERVICE_NAME_ALREADY_EXISTS_MESSAGE =
  "Ya existe un servicio con este nombre en la compañía.";

const throwIfDuplicateName = (error: unknown): never => {
  if (isOperationalLocationNameDuplicateKeyError(error)) {
    throw new AppError(409, "SERVICE_NAME_ALREADY_EXISTS", SERVICE_NAME_ALREADY_EXISTS_MESSAGE);
  }
  throw error;
};

export const serviceService = {
  async create(companyId: string, input: CreateServiceInput) {
    await companyLocationTypesService.assertActiveServiceFormat(companyId, input.serviceFormat);

    const name = input.name.trim();
    const existing = await serviceRepository.findByCompanyAndName(companyId, name);
    if (existing) {
      throw new AppError(409, "SERVICE_NAME_ALREADY_EXISTS", SERVICE_NAME_ALREADY_EXISTS_MESSAGE);
    }

    try {
      return await serviceRepository.create(companyId, {
        ...input,
        name,
        address: input.address?.trim() ?? null,
        serviceFormat: input.serviceFormat?.trim() ?? null,
      });
    } catch (error) {
      throwIfDuplicateName(error);
    }
  },

  async list(companyId: string, query: ListServicesQuery) {
    const result = await serviceRepository.list(companyId, query);
    return {
      data: result.items,
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async listFacets(companyId: string) {
    return serviceRepository.listGeoFacets(companyId);
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

    const updatePayload: UpdateServiceInput = {
      ...input,
      name: input.name !== undefined ? input.name.trim() : undefined,
      serviceFormat:
        input.serviceFormat !== undefined ? input.serviceFormat?.trim() ?? null : undefined,
    };

    if (updatePayload.name !== undefined) {
      const duplicate = await serviceRepository.findByCompanyAndNameExcludingId(
        companyId,
        updatePayload.name,
        id,
      );
      if (duplicate) {
        throw new AppError(409, "SERVICE_NAME_ALREADY_EXISTS", SERVICE_NAME_ALREADY_EXISTS_MESSAGE);
      }
    }

    try {
      const updated = await serviceRepository.update(companyId, id, updatePayload);
      if (!updated) {
        throw new AppError(404, "SERVICE_NOT_FOUND", "Servicio no encontrado");
      }
      return updated;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throwIfDuplicateName(error);
    }
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
