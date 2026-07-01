import { Router } from "express";
import { absenceRequestController } from "../controllers/absence-request.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import { listAbsenceTypesQuerySchema } from "../schemas/absence-type.schema";

export const absenceTypesRouter = Router();

absenceTypesRouter.get(
  "/",
  requirePermission("absences:read"),
  validate(listAbsenceTypesQuerySchema, "query"),
  asyncHandler(absenceRequestController.listTypes),
);
