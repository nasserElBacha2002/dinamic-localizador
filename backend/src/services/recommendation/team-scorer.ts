import {
  LOCATION_PROXIMITY_BUCKET_SCORES,
  WORKFORCE_RECOMMENDATION_V1_RECENCY,
  type LocationProximityBucket,
} from "../../constants/workforce-recommendation-v1";
import {
  WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS,
  WORKFORCE_TEAM_RECOMMENDATION_V1_WEIGHTS,
} from "../../constants/workforce-team-recommendation-v1";
import type { RecommendationReason } from "../../types/recommendation";
import { saturate } from "./recommendation-scorer";

export interface TeamPairEdge {
  employeeAId: string;
  employeeBId: string;
  sharedOccurrences: number;
  lastSharedAt: string | null;
  recent90: number;
  mid365: number;
  older: number;
}

export interface TeamMemberFeatures {
  employeeId: string;
  serviceWorkdayCount: number;
  locationBucket: LocationProximityBucket;
}

export interface TeamScoreBreakdown {
  teamAffinity: number;
  serviceExperience: number | null;
  /** null = location feature unavailable (no service geo OR no known evidence). */
  location: number | null;
  /**
   * Observability / reasons only — NOT a score weight (affinity already time-decays).
   */
  recencySignal: number;
  locationCoverage: number;
  isolationPenalty: number;
  pairCoverage: number;
  averagePairAffinity: number;
  strongPairRatio: number;
  membersWithConnections: number;
  experiencedMembers: number;
  closeMembers: number;
  knownLocationMembers: number;
  pairsWithHistory: number;
  possiblePairs: number;
  recentPairCount: number;
  score: number;
}

/** Lexicographic pair key (matches SQL CAST(... AS varchar(36)) order). */
export const teamPairKey = (leftId: string, rightId: string): string =>
  leftId < rightId ? `${leftId}|${rightId}` : `${rightId}|${leftId}`;

export const buildTeamPairMap = (edges: TeamPairEdge[]): Map<string, TeamPairEdge> => {
  const map = new Map<string, TeamPairEdge>();
  for (const edge of edges) {
    const key = teamPairKey(edge.employeeAId, edge.employeeBId);
    map.set(key, {
      ...edge,
      employeeAId: key.split("|")[0]!,
      employeeBId: key.split("|")[1]!,
    });
  }
  return map;
};

const weightedFromEdge = (edge: TeamPairEdge): number =>
  edge.recent90 * WORKFORCE_RECOMMENDATION_V1_RECENCY.recentWeight +
  edge.mid365 * WORKFORCE_RECOMMENDATION_V1_RECENCY.midWeight +
  edge.older * WORKFORCE_RECOMMENDATION_V1_RECENCY.olderWeight;

/** Saturated pair affinity in [0,1] (time-decay already applied via weightedFromEdge). */
export const computePairAffinity = (edge: TeamPairEdge | undefined): number => {
  if (!edge || edge.sharedOccurrences <= 0) {
    return 0;
  }
  return saturate(weightedFromEdge(edge), WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.pairAffinityCap);
};

const isCloseBucket = (bucket: LocationProximityBucket): boolean =>
  bucket === "SAME_ZONE" || bucket === "VERY_CLOSE" || bucket === "CLOSE";

/**
 * Team compatibility score in [0,1] with renormalization for unavailable features.
 *
 * Location:
 * - locationContextAvailable=false → omit
 * - all UNKNOWN → omit (null), not score 0
 * - mixed known/UNKNOWN → score only over known members (UNKNOWN is neutral)
 *
 * Recency is folded into pair affinity intensity; not a separate weight.
 */
export const scoreTeam = (
  memberIds: string[],
  featuresById: Map<string, TeamMemberFeatures>,
  pairMap: Map<string, TeamPairEdge>,
  options: {
    serviceContextAvailable: boolean;
    locationContextAvailable: boolean;
  },
): TeamScoreBreakdown => {
  const sortedIds = [...memberIds].sort((a, b) => a.localeCompare(b));
  const teamSize = sortedIds.length;
  const possiblePairs = teamSize < 2 ? 0 : (teamSize * (teamSize - 1)) / 2;

  let pairsWithHistory = 0;
  let affinitySum = 0;
  let strongPairs = 0;
  let recentPairCount = 0;
  const connected = new Set<string>();

  for (let i = 0; i < sortedIds.length; i += 1) {
    for (let j = i + 1; j < sortedIds.length; j += 1) {
      const left = sortedIds[i]!;
      const right = sortedIds[j]!;
      const edge = pairMap.get(teamPairKey(left, right));
      const affinity = computePairAffinity(edge);
      affinitySum += affinity;
      if (affinity > 0) {
        pairsWithHistory += 1;
        connected.add(left);
        connected.add(right);
      }
      if (affinity >= WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.strongPairThreshold) {
        strongPairs += 1;
      }
      if (edge && edge.recent90 > 0) {
        recentPairCount += 1;
      }
    }
  }

  const pairCoverage = possiblePairs > 0 ? pairsWithHistory / possiblePairs : 0;
  const averagePairAffinity = possiblePairs > 0 ? affinitySum / possiblePairs : 0;
  const strongPairRatio = possiblePairs > 0 ? strongPairs / possiblePairs : 0;
  const membersWithConnections = connected.size;
  const isolatedCount = teamSize - membersWithConnections;
  const isolationRatio = teamSize > 0 ? isolatedCount / teamSize : 0;
  const isolationPenalty =
    WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.isolationPenaltyMax * isolationRatio;

  const teamAffinity = Math.max(
    0,
    Math.min(
      1,
      0.55 * pairCoverage + 0.35 * averagePairAffinity + 0.1 * strongPairRatio - isolationPenalty,
    ),
  );

  let experiencedMembers = 0;
  let experienceSum = 0;
  let closeMembers = 0;
  let knownLocationMembers = 0;
  let locationSum = 0;

  for (const id of sortedIds) {
    const features = featuresById.get(id);
    const workdays = features?.serviceWorkdayCount ?? 0;
    if (workdays > 0) {
      experiencedMembers += 1;
    }
    experienceSum += saturate(workdays, WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.serviceExperienceCap);

    const bucket = features?.locationBucket ?? "UNKNOWN";
    const locScore = LOCATION_PROXIMITY_BUCKET_SCORES[bucket];
    if (locScore !== null) {
      knownLocationMembers += 1;
      locationSum += locScore;
      if (isCloseBucket(bucket)) {
        closeMembers += 1;
      }
    }
  }

  const serviceExperience: number | null = options.serviceContextAvailable
    ? teamSize > 0
      ? (experiencedMembers / teamSize) * (0.5 + 0.5 * (experienceSum / teamSize))
      : 0
    : null;

  const locationCoverage = teamSize > 0 ? knownLocationMembers / teamSize : 0;
  const locationEvidenceAvailable = knownLocationMembers > 0;
  const location: number | null =
    options.locationContextAvailable && locationEvidenceAvailable
      ? (closeMembers / knownLocationMembers) * 0.6 +
        (locationSum / knownLocationMembers) * 0.4
      : null;

  const recencySignal =
    pairsWithHistory > 0 ? Math.min(1, recentPairCount / pairsWithHistory) : 0;

  const parts: Array<{ weight: number; value: number }> = [
    {
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_WEIGHTS.teamAffinity,
      value: teamAffinity,
    },
  ];
  if (serviceExperience !== null) {
    parts.push({
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_WEIGHTS.serviceExperience,
      value: serviceExperience,
    });
  }
  if (location !== null) {
    parts.push({
      weight: WORKFORCE_TEAM_RECOMMENDATION_V1_WEIGHTS.location,
      value: location,
    });
  }

  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  const raw =
    weightSum <= 0
      ? 0
      : parts.reduce((sum, part) => sum + part.weight * part.value, 0) / weightSum;
  const score = Math.round(Math.max(0, Math.min(1, raw)) * 10_000) / 10_000;

  return {
    teamAffinity,
    serviceExperience,
    location,
    recencySignal,
    locationCoverage,
    isolationPenalty,
    pairCoverage,
    averagePairAffinity,
    strongPairRatio,
    membersWithConnections,
    experiencedMembers,
    closeMembers,
    knownLocationMembers,
    pairsWithHistory,
    possiblePairs,
    recentPairCount,
    score,
  };
};

export const buildTeamReasons = (
  breakdown: TeamScoreBreakdown,
  teamSize: number,
): RecommendationReason[] => {
  const reasons: RecommendationReason[] = [];

  if (breakdown.pairsWithHistory > 0) {
    reasons.push({
      code: "TEAM_HISTORY_COVERAGE",
      params: {
        members: teamSize,
        membersWithConnections: breakdown.membersWithConnections,
        pairCoverage: Math.round(breakdown.pairCoverage * 100) / 100,
        pairsWithHistory: breakdown.pairsWithHistory,
        possiblePairs: breakdown.possiblePairs,
      },
    });
  }

  if (breakdown.recentPairCount > 0) {
    reasons.push({
      code: "TEAM_RECENT_COLLABORATION",
      params: {
        recentPairCount: breakdown.recentPairCount,
        pairsWithHistory: breakdown.pairsWithHistory,
      },
    });
  }

  if (breakdown.serviceExperience !== null && breakdown.experiencedMembers > 0) {
    reasons.push({
      code: "TEAM_SERVICE_EXPERIENCE",
      params: {
        experiencedMembers: breakdown.experiencedMembers,
        teamSize,
      },
    });
  }

  if (breakdown.location !== null && breakdown.closeMembers > 0) {
    reasons.push({
      code: "TEAM_LOCATION_PROXIMITY",
      params: {
        closeMembers: breakdown.closeMembers,
        knownLocationMembers: breakdown.knownLocationMembers,
        teamSize,
      },
    });
  }

  if (
    breakdown.isolationPenalty > 0 &&
    breakdown.membersWithConnections > 0 &&
    breakdown.membersWithConnections < teamSize
  ) {
    reasons.push({
      code: "TEAM_ISOLATION_NOTE",
      params: {
        connectedMembers: breakdown.membersWithConnections,
        teamSize,
      },
    });
  }

  return reasons;
};

/** Deterministic team comparison: score DESC, then sorted member-id signature ASC. */
export const compareTeamScores = (
  left: { score: number; memberIds: string[] },
  right: { score: number; memberIds: string[] },
): number => {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const leftSig = [...left.memberIds].sort((a, b) => a.localeCompare(b)).join(",");
  const rightSig = [...right.memberIds].sort((a, b) => a.localeCompare(b)).join(",");
  return leftSig.localeCompare(rightSig);
};
