import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyLocationTypesRepository } from "../repositories/company-location-types.repository";
import { companyRepository } from "../repositories/company.repository";
import type {
  CreateCompanyLocationTypeInput,
  UpdateCompanyLocationTypeInput,
} from "../schemas/company-location-type.schema";
import type { CompanyLocationType, CompanyMembershipSummary } from "../types/company";
import { normalizeLocationTypeCode } from "../utils/location-type-code";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const assertSettingsPermission = (role: CompanyMembershipSummary["role"]): void => {
  if (!roleHasPermission(role, "company:settings:update")) {
    throw new AppError(403, "FORBIDDEN", "No tiene permisos para actualizar la configuración.");
  }
};

const resolveUniqueCode = async (
  companyId: string,
  name: string,
  preferredCode?: string,
  excludeId?: string,
): Promise<string> => {
  const baseCode = preferredCode?.trim() || normalizeLocationTypeCode(name);
  let candidate = baseCode;
  let suffix = 2;

  while (true) {
    const existing = await companyLocationTypesRepository.findByCode(companyId, candidate);
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${baseCode}_${suffix}`.slice(0, 80);
    suffix += 1;
  }
};

export const companyLocationTypesService = {
  async ensureLocationTypesCatalogForCompany(companyId: string, transaction?: import("mssql").Transaction) {
    await companyLocationTypesRepository.ensureStandardTypesForCompany(companyId, transaction);
  },

  async listLocationTypes(companyId: string, activeOnly = false): Promise<CompanyLocationType[]> {
    await assertActiveCompany(companyId);
    await this.ensureLocationTypesCatalogForCompany(companyId);
    return companyLocationTypesRepository.listByCompanyId(companyId, activeOnly);
  },

  async createLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateCompanyLocationTypeInput,
  ): Promise<CompanyLocationType> {
    assertSettingsPermission(role);
    await assertActiveCompany(companyId);

    const code = await resolveUniqueCode(companyId, input.name, input.code);
    const existingTypes = await companyLocationTypesRepository.listByCompanyId(companyId, false);
    const maxSortOrder = existingTypes.reduce((max, type) => Math.max(max, type.sortOrder), 0);

    try {
      return await companyLocationTypesRepository.create(companyId, {
        code,
        name: input.name.trim(),
        sortOrder: input.sortOrder ?? maxSortOrder + 1,
        isActive: input.isActive ?? true,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "LOCATION_TYPE_CODE_ALREADY_EXISTS",
          "Ya existe un tipo de ubicación/servicio con ese código.",
        );
      }
      throw error;
    }
  },

  async updateLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    locationTypeId: string,
    input: UpdateCompanyLocationTypeInput,
  ): Promise<CompanyLocationType> {
    assertSettingsPermission(role);
    await assertActiveCompany(companyId);

    const existing = await companyLocationTypesRepository.findById(companyId, locationTypeId);
    if (!existing) {
      throw new AppError(
        404,
        "LOCATION_TYPE_NOT_FOUND",
        "Tipo de ubicación/servicio no encontrado.",
      );
    }

    const updatePayload: UpdateCompanyLocationTypeInput = { ...input };
    if (input.code !== undefined) {
      updatePayload.code = await resolveUniqueCode(
        companyId,
        input.name ?? existing.name,
        input.code,
        locationTypeId,
      );
    }

    try {
      const updated = await companyLocationTypesRepository.update(
        companyId,
        locationTypeId,
        updatePayload,
      );
      if (!updated) {
        throw new AppError(
          404,
          "LOCATION_TYPE_NOT_FOUND",
          "Tipo de ubicación/servicio no encontrado.",
        );
      }
      return updated;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "LOCATION_TYPE_CODE_ALREADY_EXISTS",
          "Ya existe un tipo de ubicación/servicio con ese código.",
        );
      }
      throw error;
    }
  },

  async disableLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    locationTypeId: string,
  ): Promise<CompanyLocationType> {
    return this.updateLocationType(companyId, role, locationTypeId, { isActive: false });
  },

  async assertActiveStoreFormat(
    companyId: string,
    storeFormat: string | null | undefined,
  ): Promise<void> {
    if (!storeFormat?.trim()) {
      return;
    }

    await this.ensureLocationTypesCatalogForCompany(companyId);
    const locationType = await companyLocationTypesRepository.findByCode(companyId, storeFormat.trim());
    if (!locationType) {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    }

    if (!locationType.isActive) {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    }
  },

  buildActiveTypeLookup(types: CompanyLocationType[]): Set<string> {
    const lookup = new Set<string>();
    for (const type of types) {
      if (!type.isActive) {
        continue;
      }
      lookup.add(type.code.trim().toLowerCase());
      lookup.add(type.name.trim().toLowerCase());
    }
    return lookup;
  },
};
