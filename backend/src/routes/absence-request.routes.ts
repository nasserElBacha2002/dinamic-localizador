import { Router } from "express";
import { absenceRequestController } from "../controllers/absence-request.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  absenceOperationalConflictIdParamSchema,
  absenceRequestIdParamSchema,
  createAbsenceRequestSchema,
  listAbsenceRequestsQuerySchema,
  needsInfoAbsenceRequestSchema,
  rejectAbsenceRequestSchema,
  resolveAbsenceOperationalConflictSchema,
  updateNeedsInfoAbsenceRequestSchema,
} from "../schemas/absence-request.schema";

export const absenceRequestRouter = Router();

absenceRequestRouter.get(
  "/",
  requirePermission("absences:read"),
  validate(listAbsenceRequestsQuerySchema, "query"),
  asyncHandler(absenceRequestController.list),
);

absenceRequestRouter.post(
  "/",
  requirePermission("absences:review"),
  validate(createAbsenceRequestSchema),
  asyncHandler(absenceRequestController.create),
);

absenceRequestRouter.get(
  "/:id/operational-impact",
  requirePermission("absences:read"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.getOperationalImpact),
);

absenceRequestRouter.get(
  "/:id/operational-conflicts",
  requirePermission("absences:read"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.listOperationalConflicts),
);

absenceRequestRouter.post(
  "/:id/operational-conflicts/:conflictId/resolve",
  requirePermission("operations:manage"),
  validate(absenceOperationalConflictIdParamSchema, "params"),
  validate(resolveAbsenceOperationalConflictSchema),
  asyncHandler(absenceRequestController.resolveOperationalConflict),
);

absenceRequestRouter.post(
  "/:id/reconcile-operational-impact",
  requirePermission("operations:manage"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.reconcileOperationalImpact),
);

absenceRequestRouter.get(
  "/:id",
  requirePermission("absences:read"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.getById),
);

absenceRequestRouter.patch(
  "/:id",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  validate(updateNeedsInfoAbsenceRequestSchema),
  asyncHandler(absenceRequestController.updateNeedsInfo),
);

absenceRequestRouter.patch(
  "/:id/resubmit",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.resubmit),
);

absenceRequestRouter.patch(
  "/:id/approve",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.approve),
);

absenceRequestRouter.patch(
  "/:id/reject",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  validate(rejectAbsenceRequestSchema),
  asyncHandler(absenceRequestController.reject),
);

absenceRequestRouter.patch(
  "/:id/needs-info",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  validate(needsInfoAbsenceRequestSchema),
  asyncHandler(absenceRequestController.needsInfo),
);

absenceRequestRouter.patch(
  "/:id/cancel",
  requirePermission("absences:review"),
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.cancel),
);
