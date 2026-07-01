import { Router } from "express";
import { statisticsController } from "../controllers/statistics.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import { statisticsFiltersSchema, statisticsTableQuerySchema } from "../schemas/statistics.schema";

export const statisticsRouter = Router();

statisticsRouter.get(
  "/attendance/summary",
  requirePermission("reports:read"),
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.summary),
);

statisticsRouter.get(
  "/attendance/timeline",
  requirePermission("reports:read"),
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.timeline),
);

statisticsRouter.get(
  "/attendance/status-distribution",
  requirePermission("reports:read"),
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.statusDistribution),
);

statisticsRouter.get(
  "/attendance/by-employee",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byEmployee),
);

statisticsRouter.get(
  "/attendance/by-inventory",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byInventory),
);

statisticsRouter.get(
  "/attendance/by-location",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  asyncHandler(statisticsController.byLocation),
);
