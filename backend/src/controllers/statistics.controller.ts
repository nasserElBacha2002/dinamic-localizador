import type { Request, Response } from "express";
import { statisticsService } from "../services/statistics.service";
import type { StatisticsFilters, StatisticsTableQuery } from "../schemas/statistics.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const statisticsController = {
  async summary(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getSummary(companyId, req.validatedQuery as StatisticsFilters);
    res.status(200).json(result);
  },

  async timeline(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getTimeline(companyId, req.validatedQuery as StatisticsFilters);
    res.status(200).json(result);
  },

  async statusDistribution(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getStatusDistribution(
      companyId,
      req.validatedQuery as StatisticsFilters,
    );
    res.status(200).json(result);
  },

  async byEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getByEmployee(companyId, req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },

  async byOperation(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getByOperation(companyId, req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },

  async byService(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await statisticsService.getByService(companyId, req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },
};
