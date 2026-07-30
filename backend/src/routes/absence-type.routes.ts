import { Router } from "express";
import { absenceRequestController } from "../controllers/absence-request.controller";
import { absenceTypeController } from "../controllers/absence-type.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  absenceTypeIdParamSchema,
  listAbsenceTypesQuerySchema,
  updateAbsenceTypeSchema,
} from "../schemas/absence-type.schema";

export const absenceTypesRouter = Router();

absenceTypesRouter.get(
  "/",
  requirePermission("absences:read"),
  validate(listAbsenceTypesQuerySchema, "query"),
  asyncHandler(absenceRequestController.listTypes),
);

absenceTypesRouter.patch(
  "/:id",
  requirePermission("company:settings:update"),
  validate(absenceTypeIdParamSchema, "params"),
  validate(updateAbsenceTypeSchema),
  asyncHandler(absenceTypeController.update),
);
