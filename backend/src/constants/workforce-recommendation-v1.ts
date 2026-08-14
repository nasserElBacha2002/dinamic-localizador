/**
 * Workforce recommendation algorithm V1 configuration.
 * Tied to WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION ("workforce-recommendation-v1").
 *
 * Score is a compatibility / recommendation score — NOT a calibrated probability of success.
 *
 * Feature availability:
 * - teamAffinity is unavailable (omitted from denominator) when assignedCount = 0
 * - locationProximity is unavailable when geo data is missing (UNKNOWN)
 * - teamAffinity = 0 when teammates exist but candidate has no shared history
 */

export const WORKFORCE_RECOMMENDATION_V1_LIMITS = {
  defaultLimit: 10,
  maxLimit: 50,
} as const;

/** Relative feature weights when the feature is available. */
export const WORKFORCE_RECOMMENDATION_V1_WEIGHTS = {
  /** Historical co-presence with currently assigned employees. */
  teamAffinity: 0.45,
  /** Prior ACTIVE workdays on the same service (sucursal). */
  serviceExperience: 0.3,
  /** Zone centroid ↔ service coordinates proximity (or same shared zone). */
  locationProximity: 0.25,
} as const;

/**
 * Recency windows for co-occurrence weighting (calendar days before today in operation TZ).
 * SQL classification MUST use these values via request parameters — never hardcode 90/365.
 */
export const WORKFORCE_RECOMMENDATION_V1_RECENCY = {
  recentDays: 90,
  recentWeight: 1,
  midDays: 365,
  midWeight: 0.5,
  olderWeight: 0.2,
} as const;

/** Saturation caps so raw historical counts do not dominate forever. */
export const WORKFORCE_RECOMMENDATION_V1_CAPS = {
  /** Weighted shared occurrences per assigned teammate before affinity saturates. */
  affinityPerAssigneeCap: 3,
  /** Distinct past service workdays before experience saturates. */
  serviceExperienceCap: 5,
} as const;

/**
 * Approximate proximity buckets (meters) from zone centroid to service coordinates.
 * SAME_ZONE: employee and service share the same location_zones row (no string matching).
 */
export const WORKFORCE_RECOMMENDATION_V1_PROXIMITY_METERS = {
  veryClose: 2_000,
  close: 5_000,
  medium: 15_000,
} as const;

export type LocationProximityBucket =
  | "SAME_ZONE"
  | "VERY_CLOSE"
  | "CLOSE"
  | "MEDIUM"
  | "FAR"
  | "UNKNOWN";

export const LOCATION_PROXIMITY_BUCKET_SCORES: Record<LocationProximityBucket, number | null> = {
  SAME_ZONE: 1,
  VERY_CLOSE: 1,
  CLOSE: 0.75,
  MEDIUM: 0.45,
  FAR: 0.15,
  /** Missing geo → omit location from score (renormalize other weights). */
  UNKNOWN: null,
};
