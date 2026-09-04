import { roleHasPermission } from "../constants/company-permissions";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { locationZoneRepository } from "../repositories/location-zone.repository";
import type {
  CreateLocationZoneInput,
  ListLocationZonesQuery,
  SearchLocationZonesQuery,
  UpdateLocationZoneInput,
} from "../schemas/location-zone.schema";
import type { CompanyMembershipSummary } from "../types/company";
import type {
  CompanyLocationZoneView,
  LocationZone,
  LocationZoneGeocodingSummary,
} from "../types/location-zone";
import {
  canonicalizeLocationZoneDisplayName,
  canonicalizeLocationZoneLocality,
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";
import { resolveCanonicalLocality } from "../utils/geocoding/canonical-locality";
import { isDuplicateKeyError } from "../utils/sql-server-errors";
import { locationZoneGeocodingService } from "./location-zone-geocoding.service";

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

const hasManualCentroids = (
  lat: number | null | undefined,
  lon: number | null | undefined,
): boolean => typeof lat === "number" && typeof lon === "number";

/**
 * Resolve or create a global zone, then ensure company association (idempotent).
 * Race-safe via unique constraint + re-read on duplicate key.
 */
const ensureGlobalZoneAndAssociation = async (
  companyId: string,
  resolved: {
    name: string;
    normalizedName: string;
    locality: string | null;
    normalizedLocality: string;
  },
  options: {
    centroidLatitude: number | null;
    centroidLongitude: number | null;
    allowCentroidsOnCreate: boolean;
    /** Admin "Agregar" may re-enable; service/employee assign must not. */
    reactivateAssociation: boolean;
  },
): Promise<{ zone: CompanyLocationZoneView; createdGlobal: boolean }> => {
  const existing = await locationZoneRepository.findByNormalizedKey(
    resolved.normalizedName,
    resolved.normalizedLocality,
  );

  if (existing && !existing.isActive) {
    throw new AppError(
      409,
      "LOCATION_ZONE_DISABLED",
      "La zona existe en el catálogo global pero está deshabilitada.",
    );
  }

  if (existing && !options.reactivateAssociation) {
    const association = await locationZoneRepository.findAssociation(companyId, existing.id);
    if (association && !association.isActive) {
      throw new AppError(
        409,
        "LOCATION_ZONE_ASSOCIATION_INACTIVE",
        "La zona está deshabilitada para esta empresa.",
      );
    }
  }

  const manual =
    options.allowCentroidsOnCreate &&
    hasManualCentroids(options.centroidLatitude, options.centroidLongitude);

  try {
    const zone = await locationZoneRepository.resolveOrCreateGlobalAndAssociate(
      companyId,
      {
        ...resolved,
        centroidLatitude: manual ? options.centroidLatitude : null,
        centroidLongitude: manual ? options.centroidLongitude : null,
        geocodingStatus: manual ? "MANUAL" : "PENDING",
        geocodingSource: manual ? "MANUAL" : null,
        geocodedAt: manual ? new Date() : null,
        geocodingLastError: null,
      },
      { reactivateAssociation: options.reactivateAssociation },
    );

    if (!zone.isActive) {
      throw new AppError(
        409,
        "LOCATION_ZONE_DISABLED",
        "La zona existe en el catálogo global pero está deshabilitada.",
      );
    }

    return {
      zone,
      createdGlobal: !existing,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "LOCATION_ZONE_ASSOCIATION_INACTIVE"
    ) {
      throw new AppError(
        409,
        "LOCATION_ZONE_ASSOCIATION_INACTIVE",
        "La zona está deshabilitada para esta empresa.",
      );
    }
    throw error;
  }
};

export const locationZoneService = {
  async list(
    companyId: string,
    query: ListLocationZonesQuery,
  ): Promise<CompanyLocationZoneView[]> {
    await assertActiveCompany(companyId);
    return locationZoneRepository.listForCompany(companyId, {
      includeInactive: Boolean(query.includeInactive),
    });
  },

  async search(
    companyId: string,
    query: SearchLocationZonesQuery,
  ): Promise<CompanyLocationZoneView[]> {
    await assertActiveCompany(companyId);
    const q = query.q.trim();
    if (q.length < 1) {
      return [];
    }
    return locationZoneRepository.searchGlobal(companyId, {
      q,
      locality: query.locality,
      limit: query.limit ?? 20,
    });
  },

  async geocodingSummary(companyId: string): Promise<LocationZoneGeocodingSummary> {
    await assertActiveCompany(companyId);
    return locationZoneRepository.getGeocodingSummaryForCompany(companyId);
  },

  /**
   * Idempotent resolve for shared geographic catalog (services + employees).
   * Creates global zone if missing, then associates to the company.
   */
  async findOrCreateByNameLocality(
    companyId: string,
    nameInput: string,
    localityInput: string | null | undefined,
  ): Promise<CompanyLocationZoneView | null> {
    await assertActiveCompany(companyId);
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      return null;
    }

    const resolved = resolveNameKey(trimmedName, localityInput);
    const { zone } = await ensureGlobalZoneAndAssociation(companyId, resolved, {
      centroidLatitude: null,
      centroidLongitude: null,
      allowCentroidsOnCreate: false,
      reactivateAssociation: false,
    });

    if (zone.geocodingStatus === "PENDING" || zone.geocodingStatus === null) {
      if (!zone.centroidLatitude && !zone.centroidLongitude) {
        locationZoneGeocodingService.scheduleGeocode(zone);
      }
    }

    return zone;
  },

  async create(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    input: CreateLocationZoneInput,
  ): Promise<CompanyLocationZoneView> {
    assertManagePermission(role);
    await assertActiveCompany(companyId);

    const resolved = resolveNameKey(input.name, input.locality);
    const centroidLatitude =
      input.centroidLatitude === undefined ? null : input.centroidLatitude;
    const centroidLongitude =
      input.centroidLongitude === undefined ? null : input.centroidLongitude;

    const { zone, createdGlobal } = await ensureGlobalZoneAndAssociation(companyId, resolved, {
      centroidLatitude,
      centroidLongitude,
      allowCentroidsOnCreate: true,
      reactivateAssociation: true,
    });

    if (createdGlobal) {
      if (hasManualCentroids(centroidLatitude, centroidLongitude)) {
        console.info("[location-zone] LOCATION_ZONE_GEOCODING_MANUAL_OVERRIDE", {
          event: "LOCATION_ZONE_GEOCODING_MANUAL_OVERRIDE",
          zoneId: zone.id,
          companyId,
          context: "create",
        });
      } else {
        const canonical = resolveCanonicalLocality(zone.locality);
        if (canonical.status === "UNKNOWN") {
          console.info("[location-zone] LOCATION_ZONE_CANONICALIZATION_UNKNOWN", {
            event: "LOCATION_ZONE_CANONICALIZATION_UNKNOWN",
            zoneId: zone.id,
            companyId,
            locality: zone.locality,
          });
        }
        locationZoneGeocodingService.scheduleGeocode(zone);
      }
    }

    return {
      ...zone,
      assignedEmployeesCount: zone.assignedEmployeesCount ?? 0,
    };
  },

  /**
   * Company admin: may only toggle association `isActive`.
   * Platform admin: may edit global catalog fields (name/locality/centroids/global isActive).
   */
  async update(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    zoneId: string,
    input: UpdateLocationZoneInput,
    options: { isPlatformAdmin?: boolean } = {},
  ): Promise<CompanyLocationZoneView> {
    assertManagePermission(role);
    await assertActiveCompany(companyId);

    const existing = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
    if (!existing) {
      throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
    }

    const isPlatformAdmin = Boolean(options.isPlatformAdmin);
    const globalFieldKeys = [
      "name",
      "locality",
      "centroidLatitude",
      "centroidLongitude",
    ] as const;
    const touchesGlobal = globalFieldKeys.some((key) => input[key] !== undefined);

    if (touchesGlobal && !isPlatformAdmin) {
      throw new AppError(
        403,
        "FORBIDDEN_GLOBAL_LOCATION_EDIT",
        "No puede modificar el catálogo global de zonas. Solo puede habilitar o deshabilitar la zona en su empresa.",
      );
    }

    // Company-admin path: association toggle only.
    if (!isPlatformAdmin) {
      if (input.isActive === undefined) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Debe indicar si la zona queda activa o inactiva para la empresa.",
        );
      }
      const association = await locationZoneRepository.setAssociationActive(
        companyId,
        zoneId,
        input.isActive,
      );
      if (!association) {
        throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
      }
      const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
      if (!refreshed) {
        throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
      }
      return refreshed;
    }

    // Platform admin: may edit global fields + association isActive.
    let name: string | undefined;
    let normalizedName: string | undefined;
    let locality: string | null | undefined;
    let normalizedLocality: string | undefined;

    const nameChanging = input.name !== undefined;
    const localityChanging = input.locality !== undefined;
    const keyChanging = nameChanging || localityChanging;

    if (keyChanging) {
      const nextName = input.name ?? existing.name;
      const nextLocality = localityChanging ? input.locality : existing.locality;
      const resolved = resolveNameKey(nextName, nextLocality);
      const conflict = await locationZoneRepository.findByNormalizedKey(
        resolved.normalizedName,
        resolved.normalizedLocality,
      );
      if (conflict && conflict.id !== zoneId) {
        throw new AppError(
          409,
          "LOCATION_ZONE_NAME_ALREADY_EXISTS",
          "Ya existe una zona global con ese nombre y localidad.",
        );
      }
      name = resolved.name;
      normalizedName = resolved.normalizedName;
      locality = resolved.locality;
      normalizedLocality = resolved.normalizedLocality;
    }

    const centroidsProvided =
      input.centroidLatitude !== undefined && input.centroidLongitude !== undefined;
    const clearingCentroids =
      centroidsProvided &&
      input.centroidLatitude === null &&
      input.centroidLongitude === null;
    const settingManualCentroids =
      centroidsProvided &&
      typeof input.centroidLatitude === "number" &&
      typeof input.centroidLongitude === "number";

    const isManualProtected =
      existing.geocodingSource === "MANUAL" || existing.geocodingStatus === "MANUAL";

    let geocodingStatus = undefined as LocationZone["geocodingStatus"] | undefined;
    let geocodingSource = undefined as LocationZone["geocodingSource"] | undefined;
    let geocodedAt = undefined as Date | null | undefined;
    let geocodingLastError = undefined as string | null | undefined;
    let shouldScheduleGeocode = false;

    if (settingManualCentroids) {
      geocodingStatus = "MANUAL";
      geocodingSource = "MANUAL";
      geocodedAt = new Date();
      geocodingLastError = null;
    } else if (clearingCentroids) {
      geocodingStatus = "PENDING";
      geocodingSource = null;
      geocodedAt = null;
      geocodingLastError = null;
      shouldScheduleGeocode = true;
    } else if (keyChanging && !isManualProtected && !centroidsProvided) {
      geocodingStatus = "PENDING";
      geocodingSource = existing.geocodingSource === "AUTO" ? "AUTO" : null;
      geocodingLastError = null;
      geocodedAt = null;
      shouldScheduleGeocode = true;
    }

    try {
      const hasGlobalFields =
        name !== undefined ||
        locality !== undefined ||
        input.centroidLatitude !== undefined ||
        geocodingStatus !== undefined ||
        geocodingSource !== undefined ||
        geocodedAt !== undefined ||
        geocodingLastError !== undefined;

      if (hasGlobalFields) {
        const updatedGlobal = await locationZoneRepository.updateGlobal(zoneId, {
          name,
          normalizedName,
          locality,
          normalizedLocality,
          centroidLatitude:
            settingManualCentroids || clearingCentroids
              ? input.centroidLatitude
              : keyChanging && !isManualProtected && !centroidsProvided
                ? null
                : input.centroidLatitude,
          centroidLongitude:
            settingManualCentroids || clearingCentroids
              ? input.centroidLongitude
              : keyChanging && !isManualProtected && !centroidsProvided
                ? null
                : input.centroidLongitude,
          geocodingStatus,
          geocodingSource,
          geocodedAt,
          geocodingLastError,
          // Mirror prior wrapper: global isActive only when other catalog fields change.
          isActive: input.isActive,
        });
        if (!updatedGlobal) {
          throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
        }
      }

      if (input.isActive !== undefined) {
        const association = await locationZoneRepository.setAssociationActive(
          companyId,
          zoneId,
          input.isActive,
        );
        if (!association) {
          throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
        }
      }

      const updated = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
      if (!updated) {
        throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
      }

      if (settingManualCentroids) {
        console.info("[location-zone] LOCATION_ZONE_GEOCODING_MANUAL_OVERRIDE", {
          event: "LOCATION_ZONE_GEOCODING_MANUAL_OVERRIDE",
          zoneId,
          companyId,
          context: "update",
        });
      }

      if (shouldScheduleGeocode) {
        locationZoneGeocodingService.scheduleGeocode(updated);
      }

      return updated;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "LOCATION_ZONE_NAME_ALREADY_EXISTS",
          "Ya existe una zona global con ese nombre y localidad.",
        );
      }
      throw error;
    }
  },

  async geocode(
    companyId: string,
    role: CompanyMembershipSummary["role"],
    zoneId: string,
    options: { force?: boolean; isPlatformAdmin?: boolean } = {},
  ): Promise<CompanyLocationZoneView> {
    assertManagePermission(role);
    await assertActiveCompany(companyId);

    if (!options.isPlatformAdmin) {
      throw new AppError(
        403,
        "FORBIDDEN_GLOBAL_LOCATION_EDIT",
        "Solo un administrador de plataforma puede geocodificar el catálogo global.",
      );
    }

    const existing = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
    if (!existing) {
      throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
    }

    const force = Boolean(options.force);
    if (
      !force &&
      (existing.geocodingSource === "MANUAL" || existing.geocodingStatus === "MANUAL")
    ) {
      throw new AppError(
        409,
        "LOCATION_ZONE_MANUAL_OVERRIDE",
        "La zona tiene coordenadas manuales. Use force=true para recalcular automáticamente.",
      );
    }

    const attempt = await locationZoneGeocodingService.geocodeZone(existing, { force });
    if (attempt.outcome === "SKIPPED_NO_API_KEY") {
      throw new AppError(
        503,
        "GEOCODING_UNAVAILABLE",
        "Geocoding no disponible: falta GOOGLE_MAPS_API_KEY.",
      );
    }

    if (attempt.outcome === "SKIPPED_MANUAL") {
      throw new AppError(
        409,
        "LOCATION_ZONE_MANUAL_OVERRIDE",
        "La zona tiene coordenadas manuales. Use force=true para recalcular automáticamente.",
      );
    }

    if (
      attempt.outcome === "SKIPPED_STALE_INPUT" ||
      attempt.outcome === "SKIPPED_NOT_FOUND" ||
      attempt.outcome === "SKIPPED_CONCURRENT_MANUAL"
    ) {
      throw new AppError(
        409,
        "LOCATION_ZONE_GEOCODING_CONFLICT",
        "No se aplicó el geocoding: la zona cambió mientras se resolvía (renombre concurrente u override manual).",
      );
    }

    const refreshed = await locationZoneRepository.findByIdForCompany(companyId, zoneId);
    if (!refreshed) {
      throw new AppError(404, "LOCATION_ZONE_NOT_FOUND", "Zona no encontrada.");
    }

    if (attempt.outcome === "FAILED") {
      throw new AppError(
        422,
        "LOCATION_ZONE_GEOCODING_FAILED",
        attempt.errorMessage || "No se pudieron resolver las coordenadas de la zona.",
      );
    }

    return refreshed;
  },
};
