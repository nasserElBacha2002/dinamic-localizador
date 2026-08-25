import {
  LOCATION_PROXIMITY_BUCKET_SCORES,
  WORKFORCE_RECOMMENDATION_V1_CAPS,
  WORKFORCE_RECOMMENDATION_V1_PROXIMITY_METERS,
  WORKFORCE_RECOMMENDATION_V1_RECENCY,
  WORKFORCE_RECOMMENDATION_V1_WEIGHTS,
  type LocationProximityBucket,
} from "../../constants/workforce-recommendation-v1";
import { calculateDistanceMeters, InvalidCoordinatesError } from "../../utils/haversine";
import type { RecommendationReason } from "../../types/recommendation";

export interface AffinityPairStats {
  assignedEmployeeId: string;
  sharedOccurrences: number;
  lastSharedAt: string | null;
  recent90: number;
  mid365: number;
  older: number;
}

/**
 * Explicit proximity outcome for explainability (Phase B).
 * Score still uses `bucket` only; `distanceMeters` is presentation data.
 * SAME_ZONE may have null distance (zone-id match without Haversine).
 */
export type LocationProximity = {
  bucket: LocationProximityBucket;
  distanceMeters: number | null;
};

export interface CandidateFeatureInput {
  employeeId: string;
  assignedCount: number;
  affinityPairs: AffinityPairStats[];
  serviceWorkdayCount: number;
  locationBucket: LocationProximityBucket;
  /**
   * Haversine meters already computed by the caller (do not recalculate for reasons).
   * null/undefined for SAME_ZONE or when distance was not computable.
   */
  distanceMeters?: number | null;
}

export interface ScoredCandidateFeatures {
  employeeId: string;
  /** null = unavailable (no assigned teammates); 0 = available but no shared history. */
  teamAffinity: number | null;
  serviceExperience: number;
  locationProximity: number | null;
  score: number;
  matchedTeamMembers: number;
  sharedOccurrences: number;
  weightedSharedOccurrences: number;
  lastSharedAt: string | null;
  serviceWorkdayCount: number;
  locationBucket: LocationProximityBucket;
  /** Carried through for LOCATION_PROXIMITY reason params only; does not affect score. */
  distanceMeters: number | null;
  hasRecentCollaboration: boolean;
}

export const saturate = (value: number, cap: number): number => {
  if (cap <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / cap));
};

export const resolveLocationProximityBucket = (
  distanceMeters: number | null,
  sameZone = false,
): LocationProximityBucket => {
  if (sameZone) {
    return "SAME_ZONE";
  }
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) {
    return "UNKNOWN";
  }
  if (distanceMeters <= WORKFORCE_RECOMMENDATION_V1_PROXIMITY_METERS.veryClose) {
    return "VERY_CLOSE";
  }
  if (distanceMeters <= WORKFORCE_RECOMMENDATION_V1_PROXIMITY_METERS.close) {
    return "CLOSE";
  }
  if (distanceMeters <= WORKFORCE_RECOMMENDATION_V1_PROXIMITY_METERS.medium) {
    return "MEDIUM";
  }
  return "FAR";
};

export const distanceMetersBetween = (
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined,
): number | null => {
  if (
    lat1 === null ||
    lat1 === undefined ||
    lon1 === null ||
    lon1 === undefined ||
    lat2 === null ||
    lat2 === undefined ||
    lon2 === null ||
    lon2 === undefined
  ) {
    return null;
  }
  try {
    return calculateDistanceMeters(lat1, lon1, lat2, lon2);
  } catch (error) {
    if (error instanceof InvalidCoordinatesError) {
      return null;
    }
    throw error;
  }
};

const weightedFromPair = (pair: AffinityPairStats): number =>
  pair.recent90 * WORKFORCE_RECOMMENDATION_V1_RECENCY.recentWeight +
  pair.mid365 * WORKFORCE_RECOMMENDATION_V1_RECENCY.midWeight +
  pair.older * WORKFORCE_RECOMMENDATION_V1_RECENCY.olderWeight;

/**
 * Team affinity in [0,1], or null when there is no assigned team (feature unavailable).
 */
export const computeTeamAffinity = (
  assignedCount: number,
  pairs: AffinityPairStats[],
): {
  teamAffinity: number | null;
  matchedTeamMembers: number;
  sharedOccurrences: number;
  weightedSharedOccurrences: number;
  lastSharedAt: string | null;
  hasRecentCollaboration: boolean;
} => {
  if (assignedCount <= 0) {
    return {
      teamAffinity: null,
      matchedTeamMembers: 0,
      sharedOccurrences: 0,
      weightedSharedOccurrences: 0,
      lastSharedAt: null,
      hasRecentCollaboration: false,
    };
  }

  const matchedTeamMembers = pairs.filter((pair) => pair.sharedOccurrences > 0).length;
  const sharedOccurrences = pairs.reduce((sum, pair) => sum + pair.sharedOccurrences, 0);
  const weightedSharedOccurrences = pairs.reduce((sum, pair) => sum + weightedFromPair(pair), 0);
  const lastSharedAt =
    pairs
      .map((pair) => pair.lastSharedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
  const hasRecentCollaboration = pairs.some((pair) => pair.recent90 > 0);

  const coverageRatio = matchedTeamMembers / assignedCount;
  const avgWeighted = weightedSharedOccurrences / assignedCount;
  const intensity = saturate(avgWeighted, WORKFORCE_RECOMMENDATION_V1_CAPS.affinityPerAssigneeCap);
  const teamAffinity = coverageRatio * (0.5 + 0.5 * intensity);

  return {
    teamAffinity,
    matchedTeamMembers,
    sharedOccurrences,
    weightedSharedOccurrences,
    lastSharedAt,
    hasRecentCollaboration,
  };
};

export const computeServiceExperience = (serviceWorkdayCount: number): number =>
  saturate(serviceWorkdayCount, WORKFORCE_RECOMMENDATION_V1_CAPS.serviceExperienceCap);

/**
 * Weighted sum with renormalization for unavailable features (null).
 * Unavailable ≠ zero: null weights are omitted from the denominator.
 */
export const combineRecommendationScore = (input: {
  teamAffinity: number | null;
  serviceExperience: number;
  locationProximity: number | null;
}): number => {
  const parts: Array<{ weight: number; value: number }> = [
    {
      weight: WORKFORCE_RECOMMENDATION_V1_WEIGHTS.serviceExperience,
      value: input.serviceExperience,
    },
  ];
  if (input.teamAffinity !== null) {
    parts.push({
      weight: WORKFORCE_RECOMMENDATION_V1_WEIGHTS.teamAffinity,
      value: input.teamAffinity,
    });
  }
  if (input.locationProximity !== null) {
    parts.push({
      weight: WORKFORCE_RECOMMENDATION_V1_WEIGHTS.locationProximity,
      value: input.locationProximity,
    });
  }

  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weightSum <= 0) {
    return 0;
  }
  const raw = parts.reduce((sum, part) => sum + part.weight * part.value, 0) / weightSum;
  return Math.round(raw * 10_000) / 10_000;
};

export const scoreCandidateFeatures = (input: CandidateFeatureInput): ScoredCandidateFeatures => {
  const affinity = computeTeamAffinity(input.assignedCount, input.affinityPairs);
  const serviceExperience = computeServiceExperience(input.serviceWorkdayCount);
  const locationProximity = LOCATION_PROXIMITY_BUCKET_SCORES[input.locationBucket];
  const score = combineRecommendationScore({
    teamAffinity: affinity.teamAffinity,
    serviceExperience,
    locationProximity,
  });

  return {
    employeeId: input.employeeId,
    teamAffinity: affinity.teamAffinity,
    serviceExperience,
    locationProximity,
    score,
    matchedTeamMembers: affinity.matchedTeamMembers,
    sharedOccurrences: affinity.sharedOccurrences,
    weightedSharedOccurrences: affinity.weightedSharedOccurrences,
    lastSharedAt: affinity.lastSharedAt,
    serviceWorkdayCount: input.serviceWorkdayCount,
    locationBucket: input.locationBucket,
    distanceMeters:
      input.distanceMeters === undefined || input.distanceMeters === null
        ? null
        : input.distanceMeters,
    hasRecentCollaboration: affinity.hasRecentCollaboration,
  };
};

const buildLocationProximityReasonParams = (
  features: ScoredCandidateFeatures,
): Record<string, string | number | boolean | null> => {
  const params: Record<string, string | number | boolean | null> = {
    bucket: features.locationBucket,
  };

  // SAME_ZONE is identity-based; never invent 0m from a unused Haversine.
  if (features.locationBucket === "SAME_ZONE") {
    params.distanceMeters = null;
    return params;
  }

  if (
    features.distanceMeters !== null &&
    Number.isFinite(features.distanceMeters) &&
    features.distanceMeters >= 0
  ) {
    params.distanceMeters = Math.round(features.distanceMeters);
  }

  return params;
};

export const buildRecommendationReasons = (
  features: ScoredCandidateFeatures,
): RecommendationReason[] => {
  const reasons: RecommendationReason[] = [];

  if (features.matchedTeamMembers > 0 && features.sharedOccurrences > 0) {
    reasons.push({
      code: "TEAM_AFFINITY",
      params: {
        matchedTeamMembers: features.matchedTeamMembers,
        sharedOccurrences: features.sharedOccurrences,
      },
    });
  }

  if (features.hasRecentCollaboration) {
    reasons.push({
      code: "RECENT_COLLABORATION",
      params: {
        lastSharedAt: features.lastSharedAt,
      },
    });
  }

  if (features.serviceWorkdayCount > 0) {
    reasons.push({
      code: "SERVICE_EXPERIENCE",
      params: {
        serviceWorkdays: features.serviceWorkdayCount,
      },
    });
  }

  if (features.locationBucket !== "UNKNOWN") {
    reasons.push({
      code: "LOCATION_PROXIMITY",
      params: buildLocationProximityReasonParams(features),
    });
  }

  return reasons;
};

/**
 * Deterministic ranking: score DESC, serviceExperience DESC, employeeId ASC.
 */
export const compareScoredCandidates = (
  left: ScoredCandidateFeatures,
  right: ScoredCandidateFeatures,
): number => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  if (right.serviceExperience !== left.serviceExperience) {
    return right.serviceExperience - left.serviceExperience;
  }
  return left.employeeId.localeCompare(right.employeeId);
};

/** Lexicographic min of ISO date strings (YYYY-MM-DD). */
export const minIsoDate = (left: string, right: string): string => (left < right ? left : right);
