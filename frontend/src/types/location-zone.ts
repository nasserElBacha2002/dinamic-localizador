export type LocationZoneGeocodingStatus = "PENDING" | "RESOLVED" | "FAILED" | "MANUAL";
export type LocationZoneGeocodingSource = "AUTO" | "MANUAL";

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

/** Active-zone geocoding coverage (from GET .../geocoding-summary). */
export interface LocationZoneGeocodingSummary {
  total: number;
  resolved: number;
  manual: number;
  pending: number;
  failed: number;
  withCoordinates: number;
  withoutCoordinates: number;
  coveragePercent: number;
  canonicalized: number;
  missingLocality: number;
  unknownLocality: number;
}

export interface LocationZoneSummary {
  id: string;
  name: string;
  locality: string | null;
  isActive: boolean;
}

export interface CreateLocationZoneInput {
  name: string;
  locality?: string | null;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
}

export interface UpdateLocationZoneInput {
  name?: string;
  locality?: string | null;
  centroidLatitude?: number | null;
  centroidLongitude?: number | null;
  isActive?: boolean;
}

export interface ListLocationZonesFilters {
  includeInactive?: boolean;
}

export interface SearchLocationZonesFilters {
  q: string;
  locality?: string;
  limit?: number;
}

export interface GeocodeLocationZoneInput {
  force?: boolean;
}
