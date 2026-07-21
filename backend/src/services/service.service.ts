import { AppError } from "../errors/app-error";
import { serviceRepository } from "../repositories/service.repository";
import type { CreateServiceInput, ListServicesQuery, UpdateServiceInput } from "../schemas/service.schema";
import { normalizeOptionalText } from "../utils/normalize-optional-text";
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

function normalizeServiceTextFields<
  T extends {
    address?: string | null;
    neighborhood?: string | null;
    locality?: string | null;
    serviceFormat?: string | null;
  },
>(input: T): T {
  const next = { ...input };

  if ("address" in input) {
    next.address = normalizeOptionalText(input.address) as T["address"];
  }
  if ("neighborhood" in input) {
    next.neighborhood = normalizeOptionalText(input.neighborhood) as T["neighborhood"];
  }
  if ("locality" in input) {
    next.locality = normalizeOptionalText(input.locality) as T["locality"];
  }
  if ("serviceFormat" in input) {
    next.serviceFormat = normalizeOptionalText(input.serviceFormat) as T["serviceFormat"];
  }

  return next;
}

export const serviceService = {
  async create(companyId: string, input: CreateServiceInput) {
    const normalized = normalizeServiceTextFields(input);
    await companyLocationTypesService.assertActiveServiceFormat(companyId, normalized.serviceFormat);

    const name = input.name.trim();
    const existing = await serviceRepository.findByCompanyAndName(companyId, name);
    if (existing) {
      throw new AppError(409, "SERVICE_NAME_ALREADY_EXISTS", SERVICE_NAME_ALREADY_EXISTS_MESSAGE);
    }

    try {
      return await serviceRepository.create(companyId, {
        ...normalized,
        name,
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

  /**
   * Company-global geo facets (not filtered by other list query params).
   * Includes active and inactive locations; see repository contract.
   */
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

    const normalized = normalizeServiceTextFields(input);

    if (normalized.serviceFormat !== undefined) {
      await companyLocationTypesService.assertActiveServiceFormat(companyId, normalized.serviceFormat);
    }

    if (normalized.active === false) {
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
      ...normalized,
      name: input.name !== undefined ? input.name.trim() : undefined,
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
