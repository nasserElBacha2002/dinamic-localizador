import { Router } from "express";
import { absenceRequestController } from "../controllers/absence-request.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import { listAbsenceTypesQuerySchema } from "../schemas/absence-type.schema";
import { absenceRequestRouter } from "./absence-request.routes";

export const absenceRouter = Router();

absenceRouter.get(
  "/absence-types",
  requirePermission("absences:read"),
  validate(listAbsenceTypesQuerySchema, "query"),
  asyncHandler(absenceRequestController.listTypes),
);

absenceRouter.use("/absence-requests", absenceRequestRouter);
