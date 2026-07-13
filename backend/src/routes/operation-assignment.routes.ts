import { Router } from "express";
import { operationAssignmentController } from "../controllers/operation-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  assignEmployeeSchema,
  assignmentMemberParamsSchema,
  assignmentParamsSchema,
  endAssignmentSchema,
} from "../schemas/assignment.schema";

export const operationAssignmentRouter = Router({ mergeParams: true });

operationAssignmentRouter.post(
  "/",
  requirePermission("operations:manage"),
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
  requirePermission("operations:manage"),
  validate(assignmentMemberParamsSchema, "params"),
  asyncHandler(operationAssignmentController.cancelAssignment),
);
operationAssignmentRouter.post(
  "/:assignmentId/end",
  requirePermission("operations:manage"),
  validate(assignmentMemberParamsSchema, "params"),
  validate(endAssignmentSchema),
  asyncHandler(operationAssignmentController.endAssignment),
);
operationAssignmentRouter.delete(
  "/:assignmentId",
  requirePermission("operations:manage"),
  validate(assignmentMemberParamsSchema, "params"),
  asyncHandler(operationAssignmentController.cancelAssignment),
);
