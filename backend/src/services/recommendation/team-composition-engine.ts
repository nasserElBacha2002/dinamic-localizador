import {
  WORKFORCE_TEAM_RECOMMENDATION_V1_ALTERNATIVES,
  WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS,
} from "../../constants/workforce-team-recommendation-v1";
import {
  buildTeamReasons,
  compareTeamScores,
  computePairAffinity,
  scoreTeam,
  teamPairKey,
  type TeamMemberFeatures,
  type TeamPairEdge,
  type TeamScoreBreakdown,
} from "./team-scorer";
import { LOCATION_PROXIMITY_BUCKET_SCORES } from "../../constants/workforce-recommendation-v1";
import { saturate } from "./recommendation-scorer";
import { WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS } from "../../constants/workforce-team-recommendation-v1";

export interface ComposeTeamInput {
  teamSize: number;
  /** Always included (existing assignees ∪ user locks). */
  lockedIds: string[];
  /** Eligible pool (must not include locked). */
  candidates: TeamMemberFeatures[];
  pairMap: Map<string, TeamPairEdge>;
  serviceContextAvailable: boolean;
  locationContextAvailable: boolean;
  /** Soft penalty for members already used in prior alternatives (deterministic). */
  usagePenaltyById?: Map<string, number>;
  /** Hard-exclude from flexible picks (alternative generation). */
  excludeIds?: ReadonlySet<string>;
  pruneLimit?: number;
}

export interface ComposedTeam {
  memberIds: string[];
  breakdown: TeamScoreBreakdown;
}

const contextualPruneScore = (
  candidate: TeamMemberFeatures,
  lockedIds: string[],
  pairMap: Map<string, TeamPairEdge>,
  serviceContextAvailable: boolean,
  locationContextAvailable: boolean,
): number => {
  const affinity =
    lockedIds.length > 0
      ? lockedIds.reduce(
          (sum, lockedId) =>
            sum + computePairAffinity(pairMap.get(teamPairKey(candidate.employeeId, lockedId))),
          0,
        ) / lockedIds.length
      : (() => {
          let maxEdge = 0;
          for (const edge of pairMap.values()) {
            if (
              edge.employeeAId === candidate.employeeId ||
              edge.employeeBId === candidate.employeeId
            ) {
              maxEdge = Math.max(maxEdge, computePairAffinity(edge));
            }
          }
          return maxEdge;
        })();

  const service = serviceContextAvailable
    ? saturate(
        candidate.serviceWorkdayCount,
        WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS.serviceExperienceCap,
      )
    : null;
  const location = locationContextAvailable
    ? LOCATION_PROXIMITY_BUCKET_SCORES[candidate.locationBucket]
    : null;

  const parts: Array<{ weight: number; value: number }> = [
    { weight: 0.5, value: affinity },
  ];
  if (service !== null) {
    parts.push({ weight: 0.3, value: service });
  }
  if (location !== null) {
    parts.push({ weight: 0.2, value: location });
  }
  const weightSum = parts.reduce((sum, part) => sum + part.weight, 0);
  return weightSum <= 0
    ? 0
    : parts.reduce((sum, part) => sum + part.weight * part.value, 0) / weightSum;
};

const pruneCandidates = (
  input: ComposeTeamInput,
): TeamMemberFeatures[] => {
  const exclude = input.excludeIds ?? new Set<string>();
  const available = input.candidates.filter(
    (candidate) =>
      !input.lockedIds.includes(candidate.employeeId) && !exclude.has(candidate.employeeId),
  );
  const limit = input.pruneLimit ?? WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.candidatePruneLimit;
  if (available.length <= limit) {
    return available;
  }

  const scored = available.map((candidate) => ({
    candidate,
    score: contextualPruneScore(
      candidate,
      input.lockedIds,
      input.pairMap,
      input.serviceContextAvailable,
      input.locationContextAvailable,
    ),
  }));
  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.candidate.employeeId.localeCompare(right.candidate.employeeId);
  });
  return scored.slice(0, limit).map((row) => row.candidate);
};

const featuresMapFrom = (
  lockedIds: string[],
  lockedFeatures: Map<string, TeamMemberFeatures>,
  pool: TeamMemberFeatures[],
): Map<string, TeamMemberFeatures> => {
  const map = new Map<string, TeamMemberFeatures>();
  for (const id of lockedIds) {
    const features = lockedFeatures.get(id);
    if (features) {
      map.set(id, features);
    }
  }
  for (const candidate of pool) {
    map.set(candidate.employeeId, candidate);
  }
  return map;
};

const adjustedScore = (
  breakdown: TeamScoreBreakdown,
  memberIds: string[],
  usagePenaltyById: Map<string, number> | undefined,
): number => {
  if (!usagePenaltyById || usagePenaltyById.size === 0) {
    return breakdown.score;
  }
  let penalty = 0;
  for (const id of memberIds) {
    penalty += usagePenaltyById.get(id) ?? 0;
  }
  return Math.round(Math.max(0, breakdown.score - penalty) * 10_000) / 10_000;
};

const pickBestSeedPair = (
  pool: TeamMemberFeatures[],
  featuresById: Map<string, TeamMemberFeatures>,
  pairMap: Map<string, TeamPairEdge>,
  serviceContextAvailable: boolean,
  locationContextAvailable: boolean,
  usagePenaltyById: Map<string, number> | undefined,
): string[] => {
  let best: { memberIds: string[]; score: number } | null = null;

  // Prefer historical edges first (sparse).
  for (const edge of pairMap.values()) {
    if (!featuresById.has(edge.employeeAId) || !featuresById.has(edge.employeeBId)) {
      continue;
    }
    if (computePairAffinity(edge) <= 0) {
      continue;
    }
    const memberIds = [edge.employeeAId, edge.employeeBId];
    const breakdown = scoreTeam(memberIds, featuresById, pairMap, {
      serviceContextAvailable,
      locationContextAvailable,
    });
    const score = adjustedScore(breakdown, memberIds, usagePenaltyById);
    const candidate = { memberIds, score };
    if (!best || compareTeamScores(candidate, best) < 0) {
      best = candidate;
    }
  }

  if (best) {
    return best.memberIds;
  }

  // No edges: pick best contextual pair by team scorer over sorted candidates.
  const ids = pool.map((row) => row.employeeId).sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const memberIds = [ids[i]!, ids[j]!];
      const breakdown = scoreTeam(memberIds, featuresById, pairMap, {
        serviceContextAvailable,
        locationContextAvailable,
      });
      const score = adjustedScore(breakdown, memberIds, usagePenaltyById);
      const candidate = { memberIds, score };
      if (!best || compareTeamScores(candidate, best) < 0) {
        best = candidate;
      }
    }
  }

  return best?.memberIds ?? ids.slice(0, 2);
};

/**
 * Greedy team composition V1.
 * Seed = locked set, or best contextual/historical pair, then iteratively add
 * the candidate maximizing marginal team score (deterministic tie-break).
 */
export const composeTeamGreedy = (
  input: ComposeTeamInput,
  lockedFeatures: Map<string, TeamMemberFeatures>,
): ComposedTeam => {
  const lockedIds = [...new Set(input.lockedIds)].sort((a, b) => a.localeCompare(b));
  if (lockedIds.length > input.teamSize) {
    throw new Error("LOCKED_EXCEEDS_TEAM_SIZE");
  }

  const pool = pruneCandidates(input);
  const featuresById = featuresMapFrom(lockedIds, lockedFeatures, [
    ...pool,
    ...input.candidates.filter((c) => lockedIds.includes(c.employeeId)),
  ]);
  // Ensure locked feature rows exist.
  for (const id of lockedIds) {
    if (!featuresById.has(id)) {
      const fromLocked = lockedFeatures.get(id);
      if (fromLocked) {
        featuresById.set(id, fromLocked);
      }
    }
  }

  let team: string[] =
    lockedIds.length > 0
      ? [...lockedIds]
      : pickBestSeedPair(
          pool,
          featuresById,
          input.pairMap,
          input.serviceContextAvailable,
          input.locationContextAvailable,
          input.usagePenaltyById,
        );

  const teamSet = new Set(team);
  const available = pool
    .map((row) => row.employeeId)
    .filter((id) => !teamSet.has(id))
    .sort((a, b) => a.localeCompare(b));

  while (team.length < input.teamSize && available.length > 0) {
    let bestId: string | null = null;
    let bestScore = -1;
    let bestSig = "";

    for (const candidateId of available) {
      const trial = [...team, candidateId];
      const breakdown = scoreTeam(trial, featuresById, input.pairMap, {
        serviceContextAvailable: input.serviceContextAvailable,
        locationContextAvailable: input.locationContextAvailable,
      });
      const score = adjustedScore(breakdown, trial, input.usagePenaltyById);
      const sig = [...trial].sort((a, b) => a.localeCompare(b)).join(",");
      if (
        score > bestScore ||
        (score === bestScore && (bestId === null || sig.localeCompare(bestSig) < 0))
      ) {
        bestScore = score;
        bestId = candidateId;
        bestSig = sig;
      }
    }

    if (!bestId) {
      break;
    }
    team = [...team, bestId];
    teamSet.add(bestId);
    const idx = available.indexOf(bestId);
    if (idx >= 0) {
      available.splice(idx, 1);
    }
  }

  const breakdown = scoreTeam(team, featuresById, input.pairMap, {
    serviceContextAvailable: input.serviceContextAvailable,
    locationContextAvailable: input.locationContextAvailable,
  });

  return { memberIds: team, breakdown };
};

export interface ComposeAlternativesInput extends ComposeTeamInput {
  alternatives: number;
  /** Members that cannot be swapped out when generating alternatives. */
  immutableIds: string[];
}

export interface ComposedTeamAlternative extends ComposedTeam {
  rank: number;
  reasons: ReturnType<typeof buildTeamReasons>;
}

const distinctFlexibleCount = (
  left: string[],
  right: string[],
  immutable: ReadonlySet<string>,
): number => {
  const rightFlexible = new Set(right.filter((id) => !immutable.has(id)));
  let distinct = 0;
  for (const id of left) {
    if (!immutable.has(id) && !rightFlexible.has(id)) {
      distinct += 1;
    }
  }
  return distinct;
};

/**
 * Primary team + deterministic alternatives via excluding weakest flexible members
 * and soft usage penalties. Never uses randomness.
 */
export const composeTeamAlternatives = (
  input: ComposeAlternativesInput,
  lockedFeatures: Map<string, TeamMemberFeatures>,
): ComposedTeamAlternative[] => {
  const alternatives = Math.min(
    Math.max(1, input.alternatives),
    WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxAlternatives,
  );
  const immutable = new Set(input.immutableIds);
  const usagePenaltyById = new Map<string, number>(input.usagePenaltyById ?? []);
  const results: ComposedTeamAlternative[] = [];
  const exclusionSeeds: string[] = [];
  const maxAttempts = Math.max(alternatives * 3, alternatives + 2);

  for (let attempt = 0; attempt < maxAttempts && results.length < alternatives; attempt += 1) {
    const excludeIds = new Set(input.excludeIds ?? []);
    for (const seed of exclusionSeeds) {
      excludeIds.add(seed);
    }

    const composed = composeTeamGreedy(
      {
        ...input,
        excludeIds,
        usagePenaltyById,
      },
      lockedFeatures,
    );

    if (composed.memberIds.length < input.teamSize) {
      break;
    }

    const isDiverse =
      results.length === 0 ||
      results.every(
        (prior) =>
          distinctFlexibleCount(composed.memberIds, prior.memberIds, immutable) >=
          WORKFORCE_TEAM_RECOMMENDATION_V1_ALTERNATIVES.minDistinctFlexibleMembers,
      );

    if (isDiverse) {
      results.push({
        ...composed,
        rank: results.length + 1,
        reasons: buildTeamReasons(composed.breakdown, composed.memberIds.length),
      });
      for (const id of composed.memberIds) {
        if (!immutable.has(id)) {
          usagePenaltyById.set(id, (usagePenaltyById.get(id) ?? 0) + 0.02);
        }
      }
    }

    // Next exclusion: weakest flexible member of the latest team attempt.
    const flexible = composed.memberIds
      .filter((id) => !immutable.has(id) && !exclusionSeeds.includes(id))
      .sort((a, b) => a.localeCompare(b));

    if (flexible.length === 0) {
      break;
    }

    let weakestId = flexible[0]!;
    let weakestMarginal = Number.POSITIVE_INFINITY;
    const featuresById = new Map<string, TeamMemberFeatures>([
      ...lockedFeatures,
      ...input.candidates.map((c) => [c.employeeId, c] as const),
    ]);
    for (const id of flexible) {
      const without = composed.memberIds.filter((memberId) => memberId !== id);
      if (without.length < 2) {
        continue;
      }
      const full = composed.breakdown.score;
      const reduced = scoreTeam(without, featuresById, input.pairMap, {
        serviceContextAvailable: input.serviceContextAvailable,
        locationContextAvailable: input.locationContextAvailable,
      }).score;
      const marginal = full - reduced;
      if (
        marginal < weakestMarginal ||
        (marginal === weakestMarginal && id.localeCompare(weakestId) < 0)
      ) {
        weakestMarginal = marginal;
        weakestId = id;
      }
    }
    exclusionSeeds.push(weakestId);
  }

  return results;
};
