export const LOCATION_ZONE_GEOCODING_STATUSES = [
  "PENDING",
  "RESOLVED",
  "FAILED",
  "MANUAL",
] as const;

export type LocationZoneGeocodingStatus = (typeof LOCATION_ZONE_GEOCODING_STATUSES)[number];

export const LOCATION_ZONE_GEOCODING_SOURCES = ["AUTO", "MANUAL"] as const;

export type LocationZoneGeocodingSource = (typeof LOCATION_ZONE_GEOCODING_SOURCES)[number];

export interface GlobalLocationZone {
  id: string;
  name: string;
  normalizedName: string;
  locality: string | null;
  normalizedLocality: string;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
  geocodingStatus: LocationZoneGeocodingStatus | null;
  geocodingSource: LocationZoneGeocodingSource | null;
  geocodedAt: string | null;
  geocodingLastError: string | null;
  /** Global catalog active flag */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyLocationZoneView extends GlobalLocationZone {
  companyId: string;
  associationId: string;
  associationActive: boolean;
  /** Global catalog flag (same as isActive on base, kept explicit for clarity) */
  globalIsActive: boolean;
  alreadyAssociated?: boolean;
  assignedEmployeesCount?: number;
}

/** @deprecated Prefer GlobalLocationZone | CompanyLocationZoneView. Alias for gradual migration. */
export type LocationZone =
  | CompanyLocationZoneView
  | (GlobalLocationZone & {
      companyId?: string | null;
      associationId?: string | null;
      associationActive?: boolean | null;
      alreadyAssociated?: boolean;
      globalIsActive?: boolean;
      assignedEmployeesCount?: number;
    });

export interface LocationZoneGeocodingSummary {
  /** Active company associations only. */
  total: number;
  resolved: number;
  manual: number;
  pending: number;
  failed: number;
  withCoordinates: number;
  withoutCoordinates: number;
  /** withCoordinates / total * 100 (active associations). Not a quality/precision score. */
  coveragePercent: number;
  /** Active zones whose locality maps to a known canonical code. */
  canonicalized: number;
  /** Active zones with empty locality. */
  missingLocality: number;
  /** Active zones with non-empty locality that is not in the alias table. */
  unknownLocality: number;
}

/** Embedded summary on employee responses (same shape as category summary). */
export interface LocationZoneSummary {
  id: string;
  name: string;
  locality: string | null;
  isActive: boolean;
}
