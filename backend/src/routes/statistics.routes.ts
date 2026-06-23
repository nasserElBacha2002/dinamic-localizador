import { Router } from "express";
import { statisticsController } from "../controllers/statistics.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import { statisticsFiltersSchema, statisticsTableQuerySchema } from "../schemas/statistics.schema";

export const statisticsRouter = Router();

statisticsRouter.get(
  "/attendance/summary",
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.summary),
);

statisticsRouter.get(
  "/attendance/timeline",
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.timeline),
);

statisticsRouter.get(
  "/attendance/status-distribution",
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.statusDistribution),
);

statisticsRouter.get(
  "/attendance/by-employee",
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byEmployee),
);

statisticsRouter.get(
  "/attendance/by-inventory",
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byInventory),
);

statisticsRouter.get(
  "/attendance/by-location",
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byLocation),
);
