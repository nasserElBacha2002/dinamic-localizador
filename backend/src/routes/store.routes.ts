import { Router } from "express";
import { storeController } from "../controllers/store.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  createStoreSchema,
  listStoresQuerySchema,
  storeIdParamSchema,
  updateStoreSchema,
} from "../schemas/store.schema";

export const storeRouter = Router();

storeRouter.post(
  "/",
  requirePermission("stores:manage"),
  validate(createStoreSchema),
  asyncHandler(storeController.create),
);
storeRouter.get(
  "/",
  requirePermission("stores:read"),
  validate(listStoresQuerySchema, "query"),
  asyncHandler(storeController.list),
);
storeRouter.get(
  "/:id",
  requirePermission("stores:read"),
  validate(storeIdParamSchema, "params"),
  asyncHandler(storeController.getById),
);
storeRouter.put(
  "/:id",
  requirePermission("stores:manage"),
  validate(storeIdParamSchema, "params"),
  validate(updateStoreSchema),
  asyncHandler(storeController.update),
);
storeRouter.delete(
  "/:id",
  requirePermission("stores:manage"),
  validate(storeIdParamSchema, "params"),
  asyncHandler(storeController.deactivate),
);
