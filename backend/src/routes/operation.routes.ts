import { Router } from "express";
import { operationImportController } from "../controllers/operation-import.controller";
import { operationController } from "../controllers/operation.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  inventoryImportConfirmSchema,
  inventoryImportPreviewSchema,
} from "../schemas/operation-import.schema";
import {
  createInventorySchema,
  inventoryAttendanceSummaryQuerySchema,
  operationIdParamSchema,
  listInventoriesQuerySchema,
  updateInventorySchema,
} from "../schemas/operation.schema";

export const operationRouter = Router();

operationRouter.post(
  "/",
  requirePermission("operations:manage"),
  validate(createInventorySchema),
  asyncHandler(operationController.create),
);
operationRouter.post(
  "/import/preview",
  requirePermission("operations:manage"),
  validate(inventoryImportPreviewSchema),
  asyncHandler(operationImportController.preview),
);
operationRouter.post(
  "/import/confirm",
  requirePermission("operations:manage"),
  validate(inventoryImportConfirmSchema),
  asyncHandler(operationImportController.confirm),
);
operationRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(listInventoriesQuerySchema, "query"),
  asyncHandler(operationController.list),
);
operationRouter.get(
  "/:id/attendance-summary",
  requirePermission("operations:read"),
  validate(operationIdParamSchema, "params"),
  validate(inventoryAttendanceSummaryQuerySchema, "query"),
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
  validate(updateInventorySchema),
  asyncHandler(operationController.update),
);
operationRouter.delete(
  "/:id",
  requirePermission("operations:manage"),
  validate(operationIdParamSchema, "params"),
  asyncHandler(operationController.cancel),
);
