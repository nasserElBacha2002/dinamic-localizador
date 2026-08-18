import {
  LOCATION_PROXIMITY_BUCKET_SCORES,
  type LocationProximityBucket,
} from "../../constants/workforce-recommendation-v1";
import {
  WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS,
  WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_CAPS,
  WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_WEIGHTS,
} from "../../constants/workforce-team-recommendation-v1";
import type { CandidateConnectivitySummary } from "../../repositories/recommendation-feature.repository";
import { saturate } from "./recommendation-scorer";
import type { TeamMemberFeatures } from "./team-scorer";

export interface PreselectCandidateInput {
  features: TeamMemberFeatures;
  connectivity: CandidateConnectivitySummary | null;
  /** Average saturated affinity to fixed/locked members (0 when none). */
  affinityToFixed: number;
}

/**
 * Deterministic pre-pruning score blending connectivity + context.
 * Used before loading the detailed sparse pair matrix.
 */
export const computePreselectScore = (
  input: PreselectCandidateInput,
  options: { serviceContextAvailable: boolean; locationContextAvailable: boolean },
): number => {
  const conn = input.connectivity;
  const related = saturate(
    conn?.relatedEmployeeCount ?? 0,
    WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_CAPS.relatedEmployeesCap,
  );
  const weighted = saturate(
    conn?.weightedSharedOccurrences ?? 0,
    WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_CAPS.weightedSharedCap,
  );
  const strong = saturate(
    conn?.strongConnectionCount ?? 0,
    WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_CAPS.strongConnectionsCap,
  );
  const connectivityScore = 0.45 * related + 0.4 * weighted + 0.15 * strong;

  const parts: Array<{ weight: number; value: number }> = [
    {
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_WEIGHTS.historicalConnectivity,
      value: connectivityScore,
    },
    {
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_WEIGHTS.affinityToFixed,
      value: input.affinityToFixed,
    },
  ];

  if (options.serviceContextAvailable) {
    parts.push({
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_WEIGHTS.serviceExperience,
      value: saturate(input.features.serviceWorkdayCount, 5),
    });
  }

  if (options.locationContextAvailable) {
    const bucket: LocationProximityBucket = input.features.locationBucket;
    const loc = LOCATION_PROXIMITY_BUCKET_SCORES[bucket];
    if (loc !== null) {
      parts.push({
        weight: WORKFORCE_TEAM_RECOMMENDATION_V1_PRUNE_WEIGHTS.location,
        value: loc,
      });
    }
  }

  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  if (weightSum <= 0) {
    return 0;
  }
  return parts.reduce((sum, part) => sum + part.weight * part.value, 0) / weightSum;
};

/**
 * Keep top pruneLimit candidates by preselect score (deterministic tie-break by id).
 * Always returns at most pruneLimit ids from the candidate pool.
 */
export const preselectCandidateIds = (
  candidates: PreselectCandidateInput[],
  options: {
    serviceContextAvailable: boolean;
    locationContextAvailable: boolean;
    pruneLimit?: number;
  },
): string[] => {
  const limit = options.pruneLimit ?? WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.candidatePruneLimit;
  if (candidates.length <= limit) {
    return candidates.map((c) => c.features.employeeId).sort((a, b) => a.localeCompare(b));
  }

  const scored = candidates.map((candidate) => ({
    id: candidate.features.employeeId,
    score: computePreselectScore(candidate, options),
  }));
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, limit).map((row) => row.id);
};
