import type { SingleResponse } from "../types/api";
import type { IndividualEmployeeRecommendationResponse } from "../types/recommendation";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getOperationEmployeeRecommendations(
  operationId: string,
  filters: { limit?: number } = {},
): Promise<IndividualEmployeeRecommendationResponse> {
  const { data } = await scopedApiClient.get<
    SingleResponse<IndividualEmployeeRecommendationResponse>
  >(`operations/${operationId}/recommendations/employees`, {
    params: buildParams({
      limit: filters.limit,
    }),
  });
  return data.data;
}
