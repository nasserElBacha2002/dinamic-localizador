/**
 * Workforce recommendation contracts (Phase 0 foundations + Phase 1 DTO).
 *
 * `(string & {})` on code/version is deliberate forward-compatibility so newer
 * reason codes / algorithm versions can be accepted without a blocking deploy
 * of every consumer; the const arrays remain the documented V1 taxonomy.
 * Keep in sync with frontend/src/types/recommendation.ts (same codes + version).
 *
 * Score semantics: compatibility / recommendation score in [0,1] — NOT a
 * calibrated probability of assignment success.
 */

import type { EmployeeType } from "../constants/employee-types";

export const WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION = "workforce-recommendation-v1" as const;

export const WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION =
  "workforce-team-recommendation-v1" as const;

export type WorkforceRecommendationAlgorithmVersion =
  | typeof WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION
  | typeof WORKFORCE_TEAM_RECOMMENDATION_ALGORITHM_VERSION
  | (string & {});

/** Extensible reason taxonomy for recommendation responses. */
export const RECOMMENDATION_REASON_CODES = [
  "TEAM_AFFINITY",
  "LOCATION_PROXIMITY",
  "SERVICE_EXPERIENCE",
  "OPERATION_TYPE_EXPERIENCE",
  "RECENT_COLLABORATION",
  "TEAM_HISTORY_COVERAGE",
  "TEAM_SERVICE_EXPERIENCE",
  "TEAM_LOCATION_PROXIMITY",
  "TEAM_RECENT_COLLABORATION",
  "TEAM_ISOLATION_NOTE",
] as const;

export type RecommendationReasonCode = (typeof RECOMMENDATION_REASON_CODES)[number];

/**
 * UI-agnostic explanation atom. Frontend maps `code` + `params` to copy.
 * Backend must not emit localized user-facing sentences in V1+.
 *
 * LOCATION_PROXIMITY params (Phase B):
 * - `bucket`: SAME_ZONE | VERY_CLOSE | CLOSE | MEDIUM | FAR (UNKNOWN omitted)
 * - `distanceMeters`: optional approximate meters between employee zone centroid
 *   and service coordinates. null for SAME_ZONE (identity match, no invented 0m).
 *   Absent when older backends omit it — UI falls back to bucket copy.
 * Distance is centroid-based approximation, not GPS of the employee.
 * Recommendations never include centroidLatitude/centroidLongitude.
 */
export interface RecommendationReason {
  code: RecommendationReasonCode | (string & {});
  params?: Record<string, string | number | boolean | null>;
}

/** Minimal employee payload for recommendation lists (no PII beyond name). */
export interface RecommendationEmployeeSummary {
  id: string;
  name: string;
  employeeType: EmployeeType;
  categoryId: string | null;
  categoryName: string | null;
}

export interface IndividualEmployeeRecommendation {
  employee: RecommendationEmployeeSummary;
  score: number;
  rank: number;
  reasons: RecommendationReason[];
}

export interface IndividualEmployeeRecommendationResponse {
  operationId: string;
  algorithmVersion: WorkforceRecommendationAlgorithmVersion;
  generatedAt: string;
  candidateCount: number;
  recommendations: IndividualEmployeeRecommendation[];
}

/** Member row inside a team recommendation (no residence / phone / document). */
export interface TeamRecommendationMember {
  employee: RecommendationEmployeeSummary;
  alreadyAssigned: boolean;
  locked: boolean;
  role: "EXISTING" | "LOCKED" | "SUGGESTED";
}

export interface TeamRecommendationOption {
  rank: number;
  score: number;
  complete: true;
  members: TeamRecommendationMember[];
  reasons: RecommendationReason[];
}

export interface TeamRecommendationResponse {
  /** Present for operation-scoped recommendations; null for work-team context. */
  operationId: string | null;
  serviceId: string | null;
  algorithmVersion: WorkforceRecommendationAlgorithmVersion;
  generatedAt: string;
  requestedTeamSize: number;
  existingMemberCount: number;
  lockedMemberCount: number;
  slotsToFill: number;
  candidateCount: number;
  pairCount: number;
  recommendations: TeamRecommendationOption[];
}
