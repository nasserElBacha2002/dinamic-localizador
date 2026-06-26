import { Router } from "express";
import { absenceRequestController } from "../controllers/absence-request.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  absenceRequestIdParamSchema,
  createAbsenceRequestSchema,
  listAbsenceRequestsQuerySchema,
  needsInfoAbsenceRequestSchema,
  rejectAbsenceRequestSchema,
} from "../schemas/absence-request.schema";

export const absenceRequestRouter = Router();

absenceRequestRouter.get(
  "/",
  validate(listAbsenceRequestsQuerySchema, "query"),
  asyncHandler(absenceRequestController.list),
);

absenceRequestRouter.post(
  "/",
  validate(createAbsenceRequestSchema),
  asyncHandler(absenceRequestController.create),
);

absenceRequestRouter.get(
  "/:id",
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.getById),
);

absenceRequestRouter.patch(
  "/:id/approve",
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.approve),
);

absenceRequestRouter.patch(
  "/:id/reject",
  validate(absenceRequestIdParamSchema, "params"),
  validate(rejectAbsenceRequestSchema),
  asyncHandler(absenceRequestController.reject),
);

absenceRequestRouter.patch(
  "/:id/needs-info",
  validate(absenceRequestIdParamSchema, "params"),
  validate(needsInfoAbsenceRequestSchema),
  asyncHandler(absenceRequestController.needsInfo),
);

absenceRequestRouter.patch(
  "/:id/cancel",
  validate(absenceRequestIdParamSchema, "params"),
  asyncHandler(absenceRequestController.cancel),
);
