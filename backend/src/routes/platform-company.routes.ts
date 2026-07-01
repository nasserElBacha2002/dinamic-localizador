import { Router } from "express";
import { platformCompanyController } from "../controllers/platform-company.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePlatformAdmin } from "../middleware/require-platform-admin";
import { validate } from "../middleware/validate";
import { createPlatformCompanySchema } from "../schemas/platform-company.schema";

export const platformCompanyRouter = Router();

platformCompanyRouter.use(requirePlatformAdmin);

platformCompanyRouter.get("/companies", asyncHandler(platformCompanyController.listCompanies));

platformCompanyRouter.post(
  "/companies",
  validate(createPlatformCompanySchema),
  asyncHandler(platformCompanyController.createCompany),
);
