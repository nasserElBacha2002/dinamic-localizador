import { Router } from "express";
import {
  operationShiftController,
  shiftTemplateController,
} from "../controllers/operation-shift.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  createOperationShiftSchema,
  createOperationShiftVersionSchema,
  createShiftTemplateSchema,
  listOperationShiftsQuerySchema,
  listShiftTemplatesQuerySchema,
  operationShiftIdParamsSchema,
  operationShiftParamsSchema,
  shiftTemplateIdParamSchema,
  transitionToMultiShiftSchema,
  transitionToSingleSchema,
  updateOperationShiftSchema,
  updateShiftTemplateSchema,
  upsertShiftExceptionSchema,
} from "../schemas/operation-shift.schema";

export const shiftTemplateRouter = Router();

shiftTemplateRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(listShiftTemplatesQuerySchema, "query"),
  asyncHandler(shiftTemplateController.list),
);
shiftTemplateRouter.post(
  "/",
  requirePermission("operations:manage"),
  validate(createShiftTemplateSchema),
  asyncHandler(shiftTemplateController.create),
);
shiftTemplateRouter.patch(
  "/:templateId",
  requirePermission("operations:manage"),
  validate(shiftTemplateIdParamSchema, "params"),
  validate(updateShiftTemplateSchema),
  asyncHandler(shiftTemplateController.patch),
);
shiftTemplateRouter.delete(
  "/:templateId",
  requirePermission("operations:manage"),
  validate(shiftTemplateIdParamSchema, "params"),
  asyncHandler(shiftTemplateController.deactivate),
);

export const operationShiftRouter = Router({ mergeParams: true });

operationShiftRouter.get(
  "/",
  requirePermission("operations:read"),
  validate(operationShiftParamsSchema, "params"),
  validate(listOperationShiftsQuerySchema, "query"),
  asyncHandler(operationShiftController.list),
);
operationShiftRouter.post(
  "/",
  requirePermission("operations:manage"),
  validate(operationShiftParamsSchema, "params"),
  validate(createOperationShiftSchema),
  asyncHandler(operationShiftController.create),
);
operationShiftRouter.patch(
  "/:shiftId",
  requirePermission("operations:manage"),
  validate(operationShiftIdParamsSchema, "params"),
  validate(updateOperationShiftSchema),
  asyncHandler(operationShiftController.patch),
);
operationShiftRouter.delete(
  "/:shiftId",
  requirePermission("operations:manage"),
  validate(operationShiftIdParamsSchema, "params"),
  asyncHandler(operationShiftController.deactivate),
);
operationShiftRouter.post(
  "/:shiftId/versions",
  requirePermission("operations:manage"),
  validate(operationShiftIdParamsSchema, "params"),
  validate(createOperationShiftVersionSchema),
  asyncHandler(operationShiftController.addVersion),
);
operationShiftRouter.post(
  "/:shiftId/exceptions",
  requirePermission("operations:manage"),
  validate(operationShiftIdParamsSchema, "params"),
  validate(upsertShiftExceptionSchema),
  asyncHandler(operationShiftController.upsertException),
);

export const operationScheduleModeRouter = Router({ mergeParams: true });

operationScheduleModeRouter.post(
  "/multi-shift",
  requirePermission("operations:manage"),
  validate(operationShiftParamsSchema, "params"),
  validate(transitionToMultiShiftSchema),
  asyncHandler(operationShiftController.transitionToMultiShift),
);
operationScheduleModeRouter.post(
  "/single",
  requirePermission("operations:manage"),
  validate(operationShiftParamsSchema, "params"),
  validate(transitionToSingleSchema),
  asyncHandler(operationShiftController.transitionToSingle),
);
