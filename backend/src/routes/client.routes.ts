import { Router } from "express";

import { clientController } from "../controllers/client.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  clientIdParamSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from "../schemas/client.schema";

export const clientRouter = Router();

clientRouter.post(
  "/",
  requirePermission("employees:manage"),
  validate(createClientSchema),
  asyncHandler(clientController.create),
);

clientRouter.get(
  "/",
  requirePermission("employees:read"),
  validate(listClientsQuerySchema, "query"),
  asyncHandler(clientController.list),
);

clientRouter.get(
  "/:clientId",
  requirePermission("employees:read"),
  validate(clientIdParamSchema, "params"),
  asyncHandler(clientController.getById),
);

clientRouter.patch(
  "/:clientId",
  requirePermission("employees:manage"),
  validate(clientIdParamSchema, "params"),
  validate(updateClientSchema),
  asyncHandler(clientController.update),
);

clientRouter.post(
  "/:clientId/activate",
  requirePermission("employees:manage"),
  validate(clientIdParamSchema, "params"),
  asyncHandler(clientController.activate),
);

clientRouter.post(
  "/:clientId/deactivate",
  requirePermission("employees:manage"),
  validate(clientIdParamSchema, "params"),
  asyncHandler(clientController.deactivate),
);