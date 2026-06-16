import { Router } from "express";
import { inventoryAssignmentController } from "../controllers/inventory-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  assignEmployeeSchema,
  assignmentParamsSchema,
  unassignParamsSchema,
} from "../schemas/assignment.schema";

export const inventoryAssignmentRouter = Router({ mergeParams: true });

inventoryAssignmentRouter.post(
  "/",
  validate(assignmentParamsSchema, "params"),
  validate(assignEmployeeSchema),
  asyncHandler(inventoryAssignmentController.assignEmployee),
);
inventoryAssignmentRouter.get(
  "/",
  validate(assignmentParamsSchema, "params"),
  asyncHandler(inventoryAssignmentController.listAssignedEmployees),
);
inventoryAssignmentRouter.delete(
  "/:employeeId",
  validate(unassignParamsSchema, "params"),
  asyncHandler(inventoryAssignmentController.unassignEmployee),
);
