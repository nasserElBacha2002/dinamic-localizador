import { Router } from "express";
import { serviceController } from "../controllers/service.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  createServiceSchema,
  listServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceSchema,
} from "../schemas/service.schema";

export const serviceRouter = Router();

serviceRouter.post(
  "/",
  requirePermission("services:manage"),
  validate(createServiceSchema),
  asyncHandler(serviceController.create),
);
serviceRouter.get(
  "/",
  requirePermission("services:read"),
  validate(listServicesQuerySchema, "query"),
  asyncHandler(serviceController.list),
);
serviceRouter.get(
  "/:id",
  requirePermission("services:read"),
  validate(serviceIdParamSchema, "params"),
  asyncHandler(serviceController.getById),
);
serviceRouter.put(
  "/:id",
  requirePermission("services:manage"),
  validate(serviceIdParamSchema, "params"),
  validate(updateServiceSchema),
  asyncHandler(serviceController.update),
);
serviceRouter.delete(
  "/:id",
  requirePermission("services:manage"),
  validate(serviceIdParamSchema, "params"),
  asyncHandler(serviceController.deactivate),
);
