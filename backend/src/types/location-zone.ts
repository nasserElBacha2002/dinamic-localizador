export const LOCATION_ZONE_GEOCODING_STATUSES = [
  "PENDING",
  "RESOLVED",
  "FAILED",
  "MANUAL",
] as const;

export type LocationZoneGeocodingStatus = (typeof LOCATION_ZONE_GEOCODING_STATUSES)[number];

export const LOCATION_ZONE_GEOCODING_SOURCES = ["AUTO", "MANUAL"] as const;

export type LocationZoneGeocodingSource = (typeof LOCATION_ZONE_GEOCODING_SOURCES)[number];

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

export interface LocationZoneGeocodingSummary {
  /** Active zones only. */
  total: number;
  resolved: number;
  manual: number;
  pending: number;
  failed: number;
  withCoordinates: number;
  withoutCoordinates: number;
  /** withCoordinates / total * 100 (active zones). Not a quality/precision score. */
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
