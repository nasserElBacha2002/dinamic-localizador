import { Router } from "express";
import { operationAssignmentController } from "../controllers/operation-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireOperationsTeamManage, requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  assignEmployeeSchema,
  assignEmployeesBatchSchema,
  assignmentMemberParamsSchema,
  assignmentParamsSchema,
  endAssignmentSchema,
} from "../schemas/assignment.schema";

export const operationAssignmentRouter = Router({ mergeParams: true });

operationAssignmentRouter.post(
  "/batch",
  requireOperationsTeamManage(),
  validate(assignmentParamsSchema, "params"),
  validate(assignEmployeesBatchSchema),
  asyncHandler(operationAssignmentController.assignEmployeesBatch),
);
operationAssignmentRouter.post(
  "/",
  requireOperationsTeamManage(),
  validate(assignmentParamsSchema, "params"),
  validate(assignEmployeeSchema),
  asyncHandler(operationAssignmentController.assignEmployee),
);
operationAssignmentRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(assignmentParamsSchema, "params"),
  asyncHandler(operationAssignmentController.listAssignmentPeriods),
);
operationAssignmentRouter.post(
  "/:assignmentId/cancel",
  requireOperationsTeamManage(),
  validate(assignmentMemberParamsSchema, "params"),
  asyncHandler(operationAssignmentController.cancelAssignment),
);
operationAssignmentRouter.post(
  "/:assignmentId/end",
  requireOperationsTeamManage(),
  validate(assignmentMemberParamsSchema, "params"),
  validate(endAssignmentSchema),
  asyncHandler(operationAssignmentController.endAssignment),
);
operationAssignmentRouter.delete(
  "/:assignmentId",
  requireOperationsTeamManage(),
  validate(assignmentMemberParamsSchema, "params"),
  asyncHandler(operationAssignmentController.cancelAssignment),
);
