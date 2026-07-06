import { Router } from "express";
import { operationAssignmentController } from "../controllers/operation-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  assignEmployeeSchema,
  assignmentParamsSchema,
  unassignParamsSchema,
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
  asyncHandler(operationAssignmentController.listAssignedEmployees),
);
operationAssignmentRouter.delete(
  "/:employeeId",
  requirePermission("operations:manage"),
  validate(unassignParamsSchema, "params"),
  asyncHandler(operationAssignmentController.unassignEmployee),
);
