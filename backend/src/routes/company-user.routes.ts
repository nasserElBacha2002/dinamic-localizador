import { Router } from "express";
import { companyUserController } from "../controllers/company-user.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  companyUserIdParamSchema,
  createCompanyUserSchema,
  listCompanyUsersQuerySchema,
  updateCompanyUserSchema,
} from "../schemas/company-user.schema";

export const companyUserRouter = Router();

companyUserRouter.get(
  "/",
  requirePermission("users:manage"),
  validate(listCompanyUsersQuerySchema, "query"),
  asyncHandler(companyUserController.list),
);

companyUserRouter.post(
  "/",
  requirePermission("users:manage"),
  validate(createCompanyUserSchema),
  asyncHandler(companyUserController.create),
);

companyUserRouter.get(
  "/:userId",
  requirePermission("users:manage"),
  validate(companyUserIdParamSchema, "params"),
  asyncHandler(companyUserController.getById),
);

companyUserRouter.patch(
  "/:userId",
  requirePermission("users:manage"),
  validate(companyUserIdParamSchema, "params"),
  validate(updateCompanyUserSchema),
  asyncHandler(companyUserController.update),
);

companyUserRouter.patch(
  "/:userId/deactivate",
  requirePermission("users:manage"),
  validate(companyUserIdParamSchema, "params"),
  asyncHandler(companyUserController.deactivate),
);
