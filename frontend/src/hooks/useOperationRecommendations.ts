import { useQuery } from "@tanstack/react-query";
import { getOperationEmployeeRecommendations } from "../api/operation-recommendations.api";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const operationRecommendationKeys = {
  all: ["operation-recommendations"] as const,
  company: (companyId: string | null | undefined) =>
    [...operationRecommendationKeys.all, companyId ?? "none"] as const,
  employees: (companyId: string | null | undefined, operationId: string, limit?: number) =>
    [...operationRecommendationKeys.company(companyId), "employees", operationId, limit ?? 10] as const,
};

export function useOperationEmployeeRecommendations(
  operationId: string | undefined,
  limit?: number,
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(
    extraEnabled && Boolean(operationId),
  );

  return useQuery({
    queryKey: operationRecommendationKeys.employees(companyId, operationId ?? "none", limit),
    queryFn: () => getOperationEmployeeRecommendations(operationId!, { limit }),
    enabled,
  });
}
