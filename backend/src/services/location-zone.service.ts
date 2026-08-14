import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import type {
  CreateLocationZoneInput,
  ListLocationZonesQuery,
  UpdateLocationZoneInput,
} from "../schemas/location-zone.schema";
import type { CompanyMembershipSummary } from "../types/company";
import type { LocationZone } from "../types/location-zone";
import {
  canonicalizeLocationZoneDisplayName,
  canonicalizeLocationZoneLocality,
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const assertManagePermission = (role: CompanyMembershipSummary["role"]): void => {
  if (
    !roleHasPermission(role, "employees:manage") &&
    !roleHasPermission(role, "company:settings:update")
  ) {
    throw new AppError(403, "FORBIDDEN", "No tiene permisos para administrar zonas.");
  }
};

const resolveNameKey = (
  displayName: string,
  localityInput: string | null | undefined,
): {
  name: string;
  normalizedName: string;
  locality: string | null;
  normalizedLocality: string;
} => {
  const name = canonicalizeLocationZoneDisplayName(displayName);
  const normalizedName = normalizeLocationZoneName(name);
  if (!normalizedName) {
    throw new AppError(400, "VALIDATION_ERROR", "El nombre de la zona es obligatorio.");
  }

  const locality = canonicalizeLocationZoneLocality(localityInput);
  const normalizedLocality = normalizeLocationZoneLocality(locality);

  return { name, normalizedName, locality, normalizedLocality };
};

const assertKeyAvailable = async (
  companyId: string,
  displayName: string,
  localityInput: string | null | undefined,
  excludeId?: string,
): Promise<{
  name: string;
  normalizedName: string;
  locality: string | null;
  normalizedLocality: string;
}> => {
  const resolved = resolveNameKey(displayName, localityInput);
  const existing = await locationZoneRepository.findByNormalizedKey(
    companyId,
    resolved.normalizedName,
    resolved.normalizedLocality,
  );

  if (existing && existing.id !== excludeId) {
    throw new AppError(
      409,
      "LOCATION_ZONE_NAME_ALREADY_EXISTS",
      "Ya existe una zona con ese nombre y localidad en esta empresa.",
    );
  }

  return resolved;
};

export const locationZoneService = {
  async list(companyId: string, query: ListLocationZonesQuery): Promise<LocationZone[]> {
    await assertActiveCompany(companyId);
    return locationZoneRepository.listForCompany(companyId, {
      includeInactive: Boolean(query.includeInactive),
    });
  },

  /**
   * Idempotent resolve for shared geographic catalog (services + employees).
   * Does not invent centroids from service coordinates.
   */
  async findOrCreateByNameLocality(
    companyId: string,
    nameInput: string,
    localityInput: string | null | undefined,
  ): Promise<LocationZone | null> {
    await assertActiveCompany(companyId);
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      return null;
    }

    const resolved = resolveNameKey(trimmedName, localityInput);
    const existing = await locationZoneRepository.findByNormalizedKey(
      companyId,
      resolved.normalizedName,
      resolved.normalizedLocality,
    );
    if (existing) {
      return existing;
    }

    try {
      return await locationZoneRepository.create(companyId, {
        ...resolved,
        centroidLatitude: null,
        centroidLongitude: null,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const raced = await locationZoneRepository.findByNormalizedKey(
          companyId,
          resolved.normalizedName,
          resolved.normalizedLocality,
        );
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  },

  async create(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateLocationZoneInput,
  ): Promise<LocationZone> {
    assertManagePermission(role);
    await assertActiveCompany(companyId);

    const resolved = await assertKeyAvailable(companyId, input.name, input.locality);
    const centroidLatitude =
      input.centroidLatitude === undefined ? null : input.centroidLatitude;
    const centroidLongitude =
      input.centroidLongitude === undefined ? null : input.centroidLongitude;

    try {
      const created = await locationZoneRepository.create(companyId, {
        ...resolved,
        centroidLatitude,
        centroidLongitude,
      });
      return {
        ...created,
        assignedEmployeesCount: 0,
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "LOCATION_ZONE_NAME_ALREADY_EXISTS",
          "Ya existe una zona con ese nombre y localidad en esta empresa.",
        );
      }
      throw error;
    }
  },

  async update(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    zoneId: string,
    input: UpdateLocationZoneInput,
  ): Promise<LocationZone> {
    assertManagePermission(role);
    await assertActiveCompany(companyId);

    const existing = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
    if (!existing) {
      throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
    }

    let name: string | undefined;
    let normalizedName: string | undefined;
    let locality: string | null | undefined;
    let normalizedLocality: string | undefined;

    const nameChanging = input.name !== undefined;
    const localityChanging = input.locality !== undefined;

    if (nameChanging || localityChanging) {
      const nextName = input.name ?? existing.name;
      const nextLocality = localityChanging ? input.locality : existing.locality;
      const resolved = await assertKeyAvailable(companyId, nextName, nextLocality, zoneId);
      name = resolved.name;
      normalizedName = resolved.normalizedName;
      locality = resolved.locality;
      normalizedLocality = resolved.normalizedLocality;
    }

    try {
      const updated = await locationZoneRepository.update(companyId, zoneId, {
        name,
        normalizedName,
        locality,
        normalizedLocality,
        centroidLatitude: input.centroidLatitude,
        centroidLongitude: input.centroidLongitude,
        isActive: input.isActive,
      });
      if (!updated) {
        throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
      }

      const withCount = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
      return withCount ?? updated;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "LOCATION_ZONE_NAME_ALREADY_EXISTS",
          "Ya existe una zona con ese nombre y localidad en esta empresa.",
        );
      }
      throw error;
    }
  },
};
