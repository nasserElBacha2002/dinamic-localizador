import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyLocationTypesRepository } from "../repositories/company-location-types.repository";
import { companyRepository } from "../repositories/company.repository";
import { clientRepository } from "../repositories/client.repository";
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

const assertActiveClient = async (companyId: string, clientId: string): Promise<void> => {
  const client = await clientRepository.findById(companyId, clientId);
  if (!client) throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
  if (!client.isActive) throw new AppError(409, "CLIENT_INACTIVE", "Cliente inactivo");
};

const resolveRequestedCode = async (
  companyId: string,
  name: string,
  preferredCode?: string,
  excludeId?: string,
): Promise<string> => {
  const code = preferredCode?.trim() || normalizeLocationTypeCode(name);
  const existing = await companyLocationTypesRepository.findByCode(companyId, code);

  if (existing && existing.id !== excludeId) {
    throw new AppError(
      409,
      "LOCATION_TYPE_CODE_ALREADY_EXISTS",
      "Ya existe un tipo de ubicación/servicio con ese código.",
    );
  }

  return code;
};

export const companyLocationTypesService = {
  async ensureLocationTypesCatalogForCompany(companyId: string, transaction?: import("mssql").Transaction) {
    await companyLocationTypesRepository.ensureLegacyTypesForCompany(companyId, transaction);
  },

  async listLocationTypes(companyId: string, activeOnly = false): Promise<CompanyLocationType[]> {
    await assertActiveCompany(companyId);
    await this.ensureLocationTypesCatalogForCompany(companyId);
    return companyLocationTypesRepository.listByCompanyId(companyId, activeOnly);
  },

  async listLocationTypesForClient(companyId: string, clientId: string, activeOnly = false) {
    const client = await clientRepository.findById(companyId, clientId);
    if (!client) throw new AppError(404, "CLIENT_NOT_FOUND", "Cliente no encontrado");
    return companyLocationTypesRepository.listByClientId(companyId, clientId, activeOnly);
  },

  async createLocationTypeForClient(companyId: string, clientId: string, input: CreateCompanyLocationTypeInput) {
    await assertActiveCompany(companyId);
    await assertActiveClient(companyId, clientId);
    const code = await resolveRequestedCode(companyId, input.name, input.code);
    const all = await companyLocationTypesRepository.listByClientId(companyId, clientId, false);
    return companyLocationTypesRepository.create(companyId, {
      clientId, code, name: input.name.trim(), sortOrder: input.sortOrder ?? Math.max(0, ...all.map((type) => type.sortOrder)) + 1,
      isActive: input.isActive ?? true,
    });
  },

  async updateLocationTypeForClient(companyId: string, clientId: string, locationTypeId: string, input: UpdateCompanyLocationTypeInput) {
    const existing = await companyLocationTypesRepository.findByIdForClient(companyId, clientId, locationTypeId);
    if (!existing) throw new AppError(404, "LOCATION_TYPE_NOT_FOUND", "Tipo de ubicación/servicio no encontrado.");
    const payload = { ...input };
    if (input.code !== undefined) payload.code = await resolveRequestedCode(companyId, input.name ?? existing.name, input.code, locationTypeId);
    const updated = await companyLocationTypesRepository.update(companyId, locationTypeId, payload);
    if (!updated) throw new AppError(404, "LOCATION_TYPE_NOT_FOUND", "Tipo de ubicación/servicio no encontrado.");
    return updated;
  },

  async disableLocationTypeForClient(companyId: string, clientId: string, locationTypeId: string) {
    return this.updateLocationTypeForClient(companyId, clientId, locationTypeId, { isActive: false });
  },

  async createLocationType(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateCompanyLocationTypeInput,
  ): Promise<CompanyLocationType> {
    assertSettingsPermission(role);
    await assertActiveCompany(companyId);

    const code = await resolveRequestedCode(companyId, input.name, input.code);
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
      updatePayload.code = await resolveRequestedCode(
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

  async assertActiveServiceFormat(
    companyId: string,
    serviceFormat: string | null | undefined,
    clientId?: string | null,
    allowInactive = false,
  ): Promise<void> {
    if (!serviceFormat?.trim()) {
      return;
    }

    await this.ensureLocationTypesCatalogForCompany(companyId);
    const locationType = await companyLocationTypesRepository.findByCode(companyId, serviceFormat.trim());
    if (!locationType) {
      throw new AppError(
        400,
        "UNKNOWN_LOCATION_TYPE",
        "El tipo de ubicación/servicio no existe para esta empresa.",
      );
    }

    if (!locationType.isActive && !allowInactive) {
      throw new AppError(
        400,
        "INACTIVE_LOCATION_TYPE",
        "El tipo de ubicación/servicio está inactivo y no puede asignarse.",
      );
    }
    if (locationType.clientId !== null && locationType.clientId !== clientId) {
      throw new AppError(400, "INCOMPATIBLE_LOCATION_TYPE_CLIENT", "El formato no es compatible con el cliente de la sucursal.");
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
