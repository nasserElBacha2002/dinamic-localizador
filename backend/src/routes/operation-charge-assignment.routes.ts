import { Router } from "express";
import { operationChargeAssignmentController } from "../controllers/operation-charge-assignment.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireOperationsTeamManage, requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  createOperationChargeAssignmentSchema,
  endOperationChargeAssignmentSchema,
  listOperationChargeByUserQuerySchema,
  operationChargeAssignmentIdParamsSchema,
  operationChargeParamsSchema,
} from "../schemas/operation-charge-assignment.schema";

export const operationChargeAssignmentRouter = Router({ mergeParams: true });

operationChargeAssignmentRouter.get(
  "/by-user",
  requirePermission("operations:read"),
  validate(listOperationChargeByUserQuerySchema, "query"),
  asyncHandler(operationChargeAssignmentController.listByUser),
);

operationChargeAssignmentRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(operationChargeParamsSchema, "params"),
  asyncHandler(operationChargeAssignmentController.listByOperation),
);

operationChargeAssignmentRouter.post(
  "/",
  requireOperationsTeamManage(),
  validate(operationChargeParamsSchema, "params"),
  validate(createOperationChargeAssignmentSchema),
  asyncHandler(operationChargeAssignmentController.assign),
);

operationChargeAssignmentRouter.post(
  "/:assignmentId/end",
  requireOperationsTeamManage(),
  validate(operationChargeAssignmentIdParamsSchema, "params"),
  validate(endOperationChargeAssignmentSchema),
  asyncHandler(operationChargeAssignmentController.end),
);

operationChargeAssignmentRouter.post(
  "/:assignmentId/cancel",
  requireOperationsTeamManage(),
  validate(operationChargeAssignmentIdParamsSchema, "params"),
  asyncHandler(operationChargeAssignmentController.cancel),
);
