import type {
  LocationZone,
  LocationZoneGeocodingStatus,
  LocationZoneGeocodingSummary,
} from "../types/location-zone";

export function geocodingStatusLabel(
  status: LocationZoneGeocodingStatus | null,
): string {
  switch (status) {
    case "PENDING":
      return "Pendiente";
    case "RESOLVED":
      return "Resuelta";
    case "FAILED":
      return "Error";
    case "MANUAL":
      return "Manual";
    default:
      return "Sin estado";
  }
}

export function geocodingStatusColor(
  status: LocationZoneGeocodingStatus | null,
): string {
  switch (status) {
    case "RESOLVED":
      return "green";
    case "MANUAL":
      return "blue";
    case "FAILED":
      return "red";
    case "PENDING":
      return "yellow";
    default:
      return "gray";
  }
}

export type GeocodingStatusFilter = "ALL" | LocationZoneGeocodingStatus | "NONE";

export function filterZonesByGeocodingStatus(
  zones: LocationZone[],
  filter: GeocodingStatusFilter,
): LocationZone[] {
  if (filter === "ALL") {
    return zones;
  }
  if (filter === "NONE") {
    return zones.filter((zone) => zone.geocodingStatus == null);
  }
  return zones.filter((zone) => zone.geocodingStatus === filter);
}

/**
 * Client-side coverage fallback while the API summary loads.
 * Canonical locality metrics come from the backend summary only (no FE alias table).
 */
export function summarizeActiveZoneGeocoding(
  zones: LocationZone[],
): LocationZoneGeocodingSummary {
  const active = zones.filter((zone) => zone.isActive);
  let resolved = 0;
  let manual = 0;
  let pending = 0;
  let failed = 0;
  let withCoordinates = 0;

  for (const zone of active) {
    if (zone.centroidLatitude !== null && zone.centroidLongitude !== null) {
      withCoordinates += 1;
    }
    switch (zone.geocodingStatus) {
      case "RESOLVED":
        resolved += 1;
        break;
      case "MANUAL":
        manual += 1;
        break;
      case "FAILED":
        failed += 1;
        break;
      case "PENDING":
      case null:
        pending += 1;
        break;
      default:
        pending += 1;
        break;
    }
  }

  const total = active.length;
  const withoutCoordinates = total - withCoordinates;
  const coveragePercent =
    total <= 0 ? 0 : Math.round((withCoordinates / total) * 100);

  return {
    total,
    resolved,
    manual,
    pending,
    failed,
    withCoordinates,
    withoutCoordinates,
    coveragePercent,
    // Backend geocoding-summary is authoritative for these fields.
    canonicalized: 0,
    missingLocality: 0,
    unknownLocality: 0,
  };
}
