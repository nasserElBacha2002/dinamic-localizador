/**
 * Pure aggregation helper for geocoding coverage (active zones).
 * Used by unit tests and mirrors repository SQL semantics.
 */
import { resolveCanonicalLocality } from "./geocoding/canonical-locality";

export type LocationZoneGeocodingCounts = {
  total: number;
  resolved: number;
  manual: number;
  pending: number;
  failed: number;
  withCoordinates: number;
  withoutCoordinates: number;
};

export type LocationZoneCanonicalCounts = {
  canonicalized: number;
  missingLocality: number;
  unknownLocality: number;
};

export function buildGeocodingCoverageSummary(
  counts: LocationZoneGeocodingCounts,
): LocationZoneGeocodingCounts & { coveragePercent: number } {
  const total = Math.max(0, counts.total);
  const withCoordinates = Math.max(0, counts.withCoordinates);
  const coveragePercent =
    total <= 0 ? 0 : Math.round((withCoordinates / total) * 100);

  return {
    ...counts,
    total,
    withCoordinates,
    coveragePercent,
  };
}

export function summarizeCanonicalLocalities(
  localities: Array<string | null | undefined>,
): LocationZoneCanonicalCounts {
  let canonicalized = 0;
  let missingLocality = 0;
  let unknownLocality = 0;

  for (const locality of localities) {
    const resolved = resolveCanonicalLocality(locality);
    if (!resolved.displayLocality) {
      missingLocality += 1;
      continue;
    }
    if (resolved.status === "RESOLVED") {
      canonicalized += 1;
    } else {
      unknownLocality += 1;
    }
  }

  return { canonicalized, missingLocality, unknownLocality };
}
