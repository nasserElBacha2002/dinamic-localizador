/**
 * Workforce recommendation contracts (aligned with backend).
 *
 * `(string & {})` is deliberate forward-compatibility for newer codes/versions.
 * Keep aligned with backend/src/types/recommendation.ts.
 *
 * `score` is a compatibility / recommendation score in [0,1] — NOT a calibrated
 * probability of assignment success. UI may display it as affinity percentage later.
 */

import type { EmployeeType } from "../constants/employee-types";

export const WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION = "workforce-recommendation-v1" as const;

export type WorkforceRecommendationAlgorithmVersion =
  | typeof WORKFORCE_RECOMMENDATION_ALGORITHM_VERSION
  | (string & {});

export const RECOMMENDATION_REASON_CODES = [
  "TEAM_AFFINITY",
  "LOCATION_PROXIMITY",
  "SERVICE_EXPERIENCE",
  "OPERATION_TYPE_EXPERIENCE",
  "RECENT_COLLABORATION",
] as const;

export type RecommendationReasonCode = (typeof RECOMMENDATION_REASON_CODES)[number];

export interface RecommendationReason {
  code: RecommendationReasonCode | (string & {});
  params?: Record<string, string | number | boolean | null>;
}

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
