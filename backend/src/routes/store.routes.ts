import { Router } from "express";
import { storeController } from "../controllers/store.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  createStoreSchema,
  listStoresQuerySchema,
  storeIdParamSchema,
  updateStoreSchema,
} from "../schemas/store.schema";

export const storeRouter = Router();

storeRouter.post("/", validate(createStoreSchema), asyncHandler(storeController.create));
storeRouter.get("/", validate(listStoresQuerySchema, "query"), asyncHandler(storeController.list));
storeRouter.get("/:id", validate(storeIdParamSchema, "params"), asyncHandler(storeController.getById));
storeRouter.put(
  "/:id",
  validate(storeIdParamSchema, "params"),
  validate(updateStoreSchema),
  asyncHandler(storeController.update),
);
storeRouter.delete("/:id", validate(storeIdParamSchema, "params"), asyncHandler(storeController.deactivate));
