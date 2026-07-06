import { Router } from "express";
import { operationImportController } from "../controllers/operation-import.controller";
import { operationController } from "../controllers/operation.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  operationImportConfirmSchema,
  operationImportPreviewSchema,
} from "../schemas/operation-import.schema";
import {
  createOperationSchema,
  operationAttendanceSummaryQuerySchema,
  operationIdParamSchema,
  listOperationsQuerySchema,
  updateOperationSchema,
} from "../schemas/operation.schema";

export const operationRouter = Router();

operationRouter.post(
  "/",
  requirePermission("operations:manage"),
  validate(createOperationSchema),
  asyncHandler(operationController.create),
);
operationRouter.post(
  "/import/preview",
  requirePermission("operations:manage"),
  validate(operationImportPreviewSchema),
  asyncHandler(operationImportController.preview),
);
operationRouter.post(
  "/import/confirm",
  requirePermission("operations:manage"),
  validate(operationImportConfirmSchema),
  asyncHandler(operationImportController.confirm),
);
operationRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(listOperationsQuerySchema, "query"),
  asyncHandler(operationController.list),
);
operationRouter.get(
  "/:id/attendance-summary",
  requirePermission("operations:read"),
  validate(operationIdParamSchema, "params"),
  validate(operationAttendanceSummaryQuerySchema, "query"),
  asyncHandler(operationController.getAttendanceSummary),
);
operationRouter.get(
  "/:id",
  requirePermission("operations:read"),
  validate(operationIdParamSchema, "params"),
  asyncHandler(operationController.getById),
);
operationRouter.put(
  "/:id",
  requirePermission("operations:manage"),
  validate(operationIdParamSchema, "params"),
  validate(updateOperationSchema),
  asyncHandler(operationController.update),
);
operationRouter.delete(
  "/:id",
  requirePermission("operations:manage"),
  validate(operationIdParamSchema, "params"),
  asyncHandler(operationController.cancel),
);
