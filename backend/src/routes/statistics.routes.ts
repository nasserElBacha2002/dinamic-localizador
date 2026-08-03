import { Router } from "express";
import { statisticsController } from "../controllers/statistics.controller";
import { asyncHandler } from "../middleware/async-handler";
import {
  requirePermission,
  requireReportsExportWhenRequested,
} from "../middleware/company-context";
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
  "/attendance/action-exceptions",
  requirePermission("reports:read"),
  validate(statisticsFiltersSchema, "query"),
  asyncHandler(statisticsController.actionExceptions),
);

statisticsRouter.get(
  "/attendance/by-employee",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  requireReportsExportWhenRequested,
  asyncHandler(statisticsController.byEmployee),
);

statisticsRouter.get(
  "/attendance/by-operation",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  requireReportsExportWhenRequested,
  asyncHandler(statisticsController.byOperation),
);

statisticsRouter.get(
  "/attendance/by-service",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  requireReportsExportWhenRequested,
  asyncHandler(statisticsController.byService),
);

statisticsRouter.get(
  "/attendance/workday-details",
  requirePermission("reports:read"),
  validate(statisticsTableQuerySchema, "query"),
  requireReportsExportWhenRequested,
  asyncHandler(statisticsController.workdayDetails),
);
