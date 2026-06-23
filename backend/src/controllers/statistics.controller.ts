import type { Request, Response } from "express";
import { statisticsService } from "../services/statistics.service";
import type { StatisticsFilters, StatisticsTableQuery } from "../schemas/statistics.schema";

export const statisticsController = {
  async summary(req: Request, res: Response) {
    const result = await statisticsService.getSummary(req.validatedQuery as StatisticsFilters);
    res.status(200).json(result);
  },

  async timeline(req: Request, res: Response) {
    const result = await statisticsService.getTimeline(req.validatedQuery as StatisticsFilters);
    res.status(200).json(result);
  },

  async statusDistribution(req: Request, res: Response) {
    const result = await statisticsService.getStatusDistribution(req.validatedQuery as StatisticsFilters);
    res.status(200).json(result);
  },

  async byEmployee(req: Request, res: Response) {
    const result = await statisticsService.getByEmployee(req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },

  async byInventory(req: Request, res: Response) {
    const result = await statisticsService.getByInventory(req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },

  async byLocation(req: Request, res: Response) {
    const result = await statisticsService.getByLocation(req.validatedQuery as StatisticsTableQuery);
    res.status(200).json(result);
  },
};
