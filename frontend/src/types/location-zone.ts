export type LocationZoneGeocodingStatus = "PENDING" | "RESOLVED" | "FAILED" | "MANUAL";
export type LocationZoneGeocodingSource = "AUTO" | "MANUAL";

export interface LocationZone {
  id: string;
  companyId: string;
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
  isActive: boolean;
  assignedEmployeesCount?: number;
  createdAt: string;
  updatedAt: string;
}

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

export interface GeocodeLocationZoneInput {
  force?: boolean;
}
