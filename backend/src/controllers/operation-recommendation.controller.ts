import type { Request, Response } from "express";
import type {
  ListEmployeeRecommendationsQuery,
  RecommendOperationTeamInput,
} from "../schemas/operation-recommendation.schema";
import { individualRecommendationService } from "../services/individual-recommendation.service";
import { teamRecommendationService } from "../services/team-recommendation.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationRecommendationController = {
  async listEmployeeRecommendations(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as ListEmployeeRecommendationsQuery;
    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      String(req.params.id),
      query.limit,
      query.effectiveDate,
    );
    res.status(200).json({ data: result });
  },

  async recommendTeam(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as RecommendOperationTeamInput;
    const result = await teamRecommendationService.recommendTeamForOperation(
      companyId,
      String(req.params.id),
      {
        teamSize: body.teamSize,
        alternatives: body.alternatives,
        lockedEmployeeIds: body.lockedEmployeeIds,
        effectiveDate: body.effectiveDate,
      },
    );
    res.status(200).json({ data: result });
  },
};
