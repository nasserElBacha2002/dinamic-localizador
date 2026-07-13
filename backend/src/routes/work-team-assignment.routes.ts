import { Router } from "express";
import { workTeamAssignmentController } from "../controllers/work-team-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import { assignmentParamsSchema } from "../schemas/assignment.schema";
import {
  batchIdParamSchema,
  workTeamAssignConfirmSchema,
  workTeamAssignPreviewSchema,
} from "../schemas/work-team.schema";

export const operationWorkTeamAssignmentRouter = Router({ mergeParams: true });

operationWorkTeamAssignmentRouter.post(
  "/assign-preview",
  requirePermission("operations:manage"),
  validate(assignmentParamsSchema, "params"),
  validate(workTeamAssignPreviewSchema),
  asyncHandler(workTeamAssignmentController.preview),
);
operationWorkTeamAssignmentRouter.post(
  "/assign",
  requirePermission("operations:manage"),
  validate(assignmentParamsSchema, "params"),
  validate(workTeamAssignConfirmSchema),
  asyncHandler(workTeamAssignmentController.confirm),
);

export const workTeamAssignmentBatchRouter = Router();

workTeamAssignmentBatchRouter.get(
  "/:batchId",
  requirePermission("operations:read"),
  validate(batchIdParamSchema, "params"),
  asyncHandler(workTeamAssignmentController.getBatchDetail),
);
