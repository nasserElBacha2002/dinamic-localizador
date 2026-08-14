/**
 * Workforce TEAM recommendation algorithm V1 configuration.
 * Tied to WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION
 * ("workforce-team-recommendation-v1").
 *
 * Distinct from individual workforce-recommendation-v1: this optimizes a set,
 * not a top-N individual ranking.
 *
 * teamScore is a compatibility / recommendation score — NOT a calibrated
 * probability of operational success.
 *
 * Feature availability (renormalize when null):
 * - serviceExperience unavailable when no service context
 * - location unavailable when no service geo / all UNKNOWN
 * - teamAffinity always computed for teamSize >= 2 (0 = no shared history)
 */

export const WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION =
  "workforce-team-recommendation-v1" as const;

export const WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS = {
  minTeamSize: 2,
  maxTeamSize: 20,
  defaultAlternatives: 1,
  maxAlternatives: 5,
  /**
   * Max candidates after contextual pre-ranking before greedy composition.
   * Sparse pair matrix is loaded only for fixed ∪ pruned pool.
   */
  candidatePruneLimit: 80,
} as const;

/**
 * Relative weights when features are available.
 * Recency is an intra-team collaboration-freshness signal (reuses V1 decay buckets).
 */
export const WORKFORCE_TEAM_RECOMMENDATION_V1_WEIGHTS = {
  teamAffinity: 0.5,
  serviceExperience: 0.25,
  location: 0.15,
  recency: 0.1,
} as const;

export const WORKFORCE_TEAM_RECOMMENDATION_V1_CAPS = {
  /** Weighted shared occurrences on a single pair before affinity saturates. */
  pairAffinityCap: 3,
  /** Distinct past service workdays before member experience saturates. */
  serviceExperienceCap: 5,
  /**
   * Max score deduction when members have zero pair history with the rest.
   * Soft — cold-start members are not excluded.
   */
  isolationPenaltyMax: 0.12,
  /** Pair affinity above this counts as a "strong" historical link. */
  strongPairThreshold: 0.55,
} as const;

/**
 * Alternatives must differ from prior teams by at least this many flexible members
 * (not locked / not already assigned), capped by available slots.
 */
export const WORKFORCE_TEAM_RECOMMENDATION_V1_ALTERNATIVES = {
  minDistinctFlexibleMembers: 1,
} as const;
