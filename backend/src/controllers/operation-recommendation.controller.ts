import type { Request, Response } from "express";
import { individualRecommendationService } from "../services/individual-recommendation.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationRecommendationController = {
  async listEmployeeRecommendations(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { limit: number };
    const result = await individualRecommendationService.recommendEmployees(
      companyId,
      String(req.params.id),
      query.limit,
    );
    res.status(200).json({ data: result });
  },
};
