import { Router } from "express";
import { inventoryImportController } from "../controllers/inventory-import.controller";
import { inventoryController } from "../controllers/inventory.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  inventoryImportConfirmSchema,
  inventoryImportPreviewSchema,
} from "../schemas/inventory-import.schema";
import {
  createInventorySchema,
  inventoryAttendanceSummaryQuerySchema,
  inventoryIdParamSchema,
  listInventoriesQuerySchema,
  updateInventorySchema,
} from "../schemas/inventory.schema";

export const inventoryRouter = Router();

inventoryRouter.post(
  "/",
  requirePermission("inventories:manage"),
  validate(createInventorySchema),
  asyncHandler(inventoryController.create),
);
inventoryRouter.post(
  "/import/preview",
  requirePermission("inventories:manage"),
  validate(inventoryImportPreviewSchema),
  asyncHandler(inventoryImportController.preview),
);
inventoryRouter.post(
  "/import/confirm",
  requirePermission("inventories:manage"),
  validate(inventoryImportConfirmSchema),
  asyncHandler(inventoryImportController.confirm),
);
inventoryRouter.get(
  "/",
  requirePermission("inventories:read"),
  validate(listInventoriesQuerySchema, "query"),
  asyncHandler(inventoryController.list),
);
inventoryRouter.get(
  "/:id/attendance-summary",
  requirePermission("inventories:read"),
  validate(inventoryIdParamSchema, "params"),
  validate(inventoryAttendanceSummaryQuerySchema, "query"),
  asyncHandler(inventoryController.getAttendanceSummary),
);
inventoryRouter.get(
  "/:id",
  requirePermission("inventories:read"),
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.getById),
);
inventoryRouter.put(
  "/:id",
  requirePermission("inventories:manage"),
  validate(inventoryIdParamSchema, "params"),
  validate(updateInventorySchema),
  asyncHandler(inventoryController.update),
);
inventoryRouter.delete(
  "/:id",
  requirePermission("inventories:manage"),
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.cancel),
);
