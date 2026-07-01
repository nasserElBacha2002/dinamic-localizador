import { Router } from "express";
import { companyController } from "../controllers/company.controller";
import { resolveCompanyContext, requirePermission } from "../middleware/company-context";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  companyIdParamSchema,
  updateCompanySettingsSchema,
} from "../schemas/company.schema";

export const companyRouter = Router();

companyRouter.get("/", asyncHandler(companyController.listForCurrentUser));

companyRouter.get(
  "/:companyId/me",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  asyncHandler(companyController.getMembership),
);

companyRouter.get(
  "/:companyId/settings",
  validate(companyIdParamSchema, "params"),
  resolveCompanyContext,
  requirePermission("company:read"),
  asyncHandler(companyController.getSettings),
);

companyRouter.patch(
  "/:companyId/settings",
  validate(companyIdParamSchema, "params"),
  validate(updateCompanySettingsSchema),
  resolveCompanyContext,
  requirePermission("company:settings:update"),
  asyncHandler(companyController.updateSettings),
);
