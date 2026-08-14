import type { SingleResponse } from "../types/api";
import type {
  IndividualEmployeeRecommendationResponse,
  RecommendOperationTeamInput,
  RecommendWorkTeamInput,
  TeamRecommendationResponse,
} from "../types/recommendation";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getOperationEmployeeRecommendations(
  operationId: string,
  filters: { limit?: number; effectiveDate?: string } = {},
): Promise<IndividualEmployeeRecommendationResponse> {
  const { data } = await scopedApiClient.get<
    SingleResponse<IndividualEmployeeRecommendationResponse>
  >(`operations/${operationId}/recommendations/employees`, {
    params: buildParams({
      limit: filters.limit,
      effectiveDate: filters.effectiveDate,
    }),
  });
  return data.data;
}

export async function postOperationTeamRecommendation(
  operationId: string,
  body: RecommendOperationTeamInput,
): Promise<TeamRecommendationResponse> {
  const { data } = await scopedApiClient.post<SingleResponse<TeamRecommendationResponse>>(
    `operations/${operationId}/recommendations/team`,
    body,
  );
  return data.data;
}

export async function postWorkTeamRecommendation(
  body: RecommendWorkTeamInput,
): Promise<TeamRecommendationResponse> {
  const { data } = await scopedApiClient.post<SingleResponse<TeamRecommendationResponse>>(
    `work-teams/recommendations/team`,
    body,
  );
  return data.data;
}
