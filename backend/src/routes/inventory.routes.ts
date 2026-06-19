import { Router } from "express";
import { inventoryController } from "../controllers/inventory.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  createInventorySchema,
  inventoryAttendanceSummaryQuerySchema,
  inventoryIdParamSchema,
  listInventoriesQuerySchema,
  updateInventorySchema,
} from "../schemas/inventory.schema";

export const inventoryRouter = Router();

inventoryRouter.post("/", validate(createInventorySchema), asyncHandler(inventoryController.create));
inventoryRouter.get(
  "/",
  validate(listInventoriesQuerySchema, "query"),
  asyncHandler(inventoryController.list),
);
inventoryRouter.get(
  "/:id/attendance-summary",
  validate(inventoryIdParamSchema, "params"),
  validate(inventoryAttendanceSummaryQuerySchema, "query"),
  asyncHandler(inventoryController.getAttendanceSummary),
);
inventoryRouter.get(
  "/:id",
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.getById),
);
inventoryRouter.put(
  "/:id",
  validate(inventoryIdParamSchema, "params"),
  validate(updateInventorySchema),
  asyncHandler(inventoryController.update),
);
inventoryRouter.delete(
  "/:id",
  validate(inventoryIdParamSchema, "params"),
  asyncHandler(inventoryController.cancel),
);
