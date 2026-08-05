import { Router } from "express";
import { platformCompanyController } from "../controllers/platform-company.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { validate } from "../middleware/validate";
import { createPlatformCompanySchema } from "../schemas/platform-company.schema";
import {
  companyIdParamsSchema,
  deactivatePlatformCompanySchema,
} from "../schemas/platform-company-lifecycle.schema";

export const platformCompanyRouter = Router();

platformCompanyRouter.use(asyncHandler(requirePlatformAdmin));

platformCompanyRouter.get("/companies", asyncHandler(platformCompanyController.listCompanies));

platformCompanyRouter.post(
  "/companies",
  validate(createPlatformCompanySchema),
  asyncHandler(platformCompanyController.createCompany),
);

platformCompanyRouter.post(
  "/companies/:companyId/deactivate",
  validate(companyIdParamsSchema, "params"),
  validate(deactivatePlatformCompanySchema),
  asyncHandler(platformCompanyController.deactivateCompany),
);

platformCompanyRouter.post(
  "/companies/:companyId/reactivate",
  validate(companyIdParamsSchema, "params"),
  asyncHandler(platformCompanyController.reactivateCompany),
);

platformCompanyRouter.get(
  "/companies/:companyId/deletion-status",
  validate(companyIdParamsSchema, "params"),
  asyncHandler(platformCompanyController.getDeletionStatus),
);
