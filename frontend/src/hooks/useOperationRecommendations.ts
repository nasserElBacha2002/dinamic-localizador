import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getOperationEmployeeRecommendations,
  postOperationTeamRecommendation,
  postWorkTeamRecommendation,
} from "../api/operation-recommendations.api";
import type {
  RecommendOperationTeamInput,
  RecommendWorkTeamInput,
} from "../types/recommendation";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const operationRecommendationKeys = {
  all: ["operation-recommendations"] as const,
  company: (companyId: string | null | undefined) =>
    [...operationRecommendationKeys.all, companyId ?? "none"] as const,
  employees: (
    companyId: string | null | undefined,
    operationId: string,
    limit?: number,
    effectiveDate?: string | null,
  ) =>
    [
      ...operationRecommendationKeys.company(companyId),
      "employees",
      operationId,
      limit ?? 10,
      effectiveDate ?? null,
    ] as const,
  team: (
    companyId: string | null | undefined,
    operationId: string,
    teamSize: number,
    alternatives: number,
    lockedKey: string,
    effectiveDate?: string | null,
  ) =>
    [
      ...operationRecommendationKeys.company(companyId),
      "team",
      operationId,
      teamSize,
      alternatives,
      lockedKey,
      effectiveDate ?? null,
    ] as const,
};

export const workTeamRecommendationKeys = {
  all: ["work-team-recommendations"] as const,
  company: (companyId: string | null | undefined) =>
    [...workTeamRecommendationKeys.all, companyId ?? "none"] as const,
};

export function useOperationEmployeeRecommendations(
  operationId: string | undefined,
  options: {
    limit?: number;
    effectiveDate?: string | null;
    /** When false, query stays disabled (e.g. invalid recurring date). */
    dateReady?: boolean;
  } = {},
  extraEnabled = true,
) {
  const { limit, effectiveDate = null, dateReady = true } = options;
  const { companyId, enabled } = useOperationalQueryEnabled(
    extraEnabled && Boolean(operationId) && dateReady,
  );

  return useQuery({
    queryKey: operationRecommendationKeys.employees(
      companyId,
      operationId ?? "none",
      limit,
      effectiveDate,
    ),
    queryFn: () =>
      getOperationEmployeeRecommendations(operationId!, {
        limit,
        ...(effectiveDate ? { effectiveDate } : {}),
      }),
    enabled,
  });
}

/** Explicit POST — does not auto-fetch; caller triggers via mutate. */
export function useRecommendOperationTeam(operationId: string | undefined) {
  return useMutation({
    mutationFn: (body: RecommendOperationTeamInput) => {
      if (!operationId) {
        throw new Error("operationId requerido");
      }
      return postOperationTeamRecommendation(operationId, body);
    },
  });
}

export function useRecommendWorkTeam() {
  return useMutation({
    mutationFn: (body: RecommendWorkTeamInput) => postWorkTeamRecommendation(body),
  });
}
