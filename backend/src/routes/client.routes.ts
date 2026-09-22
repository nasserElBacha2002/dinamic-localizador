import { Router } from "express";

import { clientController } from "../controllers/client.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  clientIdParamSchema,
  clientEmployeeParamsSchema,
  createClientSchema,
  listClientsQuerySchema,
  replaceClientEmployeesSchema,
  updateClientSchema,
} from "../schemas/client.schema";
import { createCompanyLocationTypeSchema, updateCompanyLocationTypeSchema, clientLocationTypeParamsSchema, listClientLocationTypesQuerySchema } from "../schemas/company-location-type.schema";

export const clientRouter = Router();

clientRouter.post(
  "/",
  requirePermission("employees:manage"),
  validate(createClientSchema),
  asyncHandler(clientController.create),
);

clientRouter.get("/:clientId/location-types", requirePermission("employees:read"), validate(clientIdParamSchema, "params"), validate(listClientLocationTypesQuerySchema, "query"), asyncHandler(clientController.listLocationTypes));
clientRouter.post("/:clientId/location-types", requirePermission("employees:manage"), validate(clientIdParamSchema, "params"), validate(createCompanyLocationTypeSchema), asyncHandler(clientController.createLocationType));
clientRouter.patch("/:clientId/location-types/:locationTypeId", requirePermission("employees:manage"), validate(clientLocationTypeParamsSchema, "params"), validate(updateCompanyLocationTypeSchema), asyncHandler(clientController.updateLocationType));
clientRouter.delete("/:clientId/location-types/:locationTypeId", requirePermission("employees:manage"), validate(clientLocationTypeParamsSchema, "params"), asyncHandler(clientController.disableLocationType));
clientRouter.get("/:clientId/employees", requirePermission("employees:read"), validate(clientIdParamSchema, "params"), asyncHandler(clientController.listEmployees));
clientRouter.put("/:clientId/employees", requirePermission("employees:manage"), validate(clientIdParamSchema, "params"), validate(replaceClientEmployeesSchema), asyncHandler(clientController.replaceEmployees));
clientRouter.delete("/:clientId/employees/:employeeId", requirePermission("employees:manage"), validate(clientEmployeeParamsSchema, "params"), asyncHandler(clientController.removeEmployee));

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
