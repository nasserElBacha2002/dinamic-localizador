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
  team: (
    companyId: string | null | undefined,
    teamSize: number,
    alternatives: number,
    lockedKey: string,
    serviceId: string | null,
  ) =>
    [
      ...workTeamRecommendationKeys.company(companyId),
      "team",
      teamSize,
      alternatives,
      lockedKey,
      serviceId ?? null,
    ] as const,
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

/**
 * Proactive operation team composition (POST as queryFn).
 * Prefer this for auto-suggestions; keep useRecommendOperationTeam for locked recomplete.
 */
export function useOperationTeamRecommendation(
  operationId: string | undefined,
  input: {
    teamSize: number;
    alternatives?: number;
    lockedEmployeeIds?: string[];
    effectiveDate?: string | null;
  },
  extraEnabled = true,
) {
  const alternatives = input.alternatives ?? 3;
  const lockedEmployeeIds = input.lockedEmployeeIds ?? [];
  const lockedKey = lockedEmployeeKey(lockedEmployeeIds);
  const effectiveDate = input.effectiveDate ?? null;
  const { companyId, enabled } = useOperationalQueryEnabled(
    extraEnabled &&
      Boolean(operationId) &&
      input.teamSize >= 2 &&
      input.teamSize <= 20,
  );

  return useQuery({
    queryKey: operationRecommendationKeys.team(
      companyId,
      operationId ?? "none",
      input.teamSize,
      alternatives,
      lockedKey,
      effectiveDate,
    ),
    queryFn: () =>
      postOperationTeamRecommendation(operationId!, {
        teamSize: input.teamSize,
        alternatives,
        lockedEmployeeIds,
        ...(effectiveDate ? { effectiveDate } : {}),
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useRecommendWorkTeam() {
  return useMutation({
    mutationFn: (body: RecommendWorkTeamInput) => postWorkTeamRecommendation(body),
  });
}

function lockedEmployeeKey(ids: string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join(",");
}

/**
 * Proactive work-team composition query (POST as queryFn).
 * Disabled when locked members already fill teamSize (avoids apply→refetch loops).
 */
export function useWorkTeamTeamRecommendation(
  input: {
    teamSize: number;
    alternatives?: number;
    lockedEmployeeIds?: string[];
    serviceId?: string | null;
  },
  extraEnabled = true,
) {
  const alternatives = input.alternatives ?? 3;
  const lockedEmployeeIds = input.lockedEmployeeIds ?? [];
  const lockedKey = lockedEmployeeKey(lockedEmployeeIds);
  const serviceId = input.serviceId ?? null;
  const slotsRemain = input.teamSize > lockedEmployeeIds.length;
  const { companyId, enabled } = useOperationalQueryEnabled(
    extraEnabled && input.teamSize >= 2 && input.teamSize <= 20 && slotsRemain,
  );

  return useQuery({
    queryKey: workTeamRecommendationKeys.team(
      companyId,
      input.teamSize,
      alternatives,
      lockedKey,
      serviceId,
    ),
    queryFn: () =>
      postWorkTeamRecommendation({
        teamSize: input.teamSize,
        alternatives,
        lockedEmployeeIds,
        serviceId,
      }),
    enabled,
    staleTime: 30_000,
  });
}
