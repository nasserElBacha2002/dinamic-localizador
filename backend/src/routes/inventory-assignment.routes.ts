import { Router } from "express";
import { inventoryAssignmentController } from "../controllers/inventory-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  assignEmployeeSchema,
  assignmentParamsSchema,
  unassignParamsSchema,
} from "../schemas/assignment.schema";

export const inventoryAssignmentRouter = Router({ mergeParams: true });

inventoryAssignmentRouter.post(
  "/",
  requirePermission("inventories:manage"),
  validate(assignmentParamsSchema, "params"),
  validate(assignEmployeeSchema),
  asyncHandler(inventoryAssignmentController.assignEmployee),
);
inventoryAssignmentRouter.get(
  "/",
  requirePermission("inventories:read"),
  validate(assignmentParamsSchema, "params"),
  asyncHandler(inventoryAssignmentController.listAssignedEmployees),
);
inventoryAssignmentRouter.delete(
  "/:employeeId",
  requirePermission("inventories:manage"),
  validate(unassignParamsSchema, "params"),
  asyncHandler(inventoryAssignmentController.unassignEmployee),
);
