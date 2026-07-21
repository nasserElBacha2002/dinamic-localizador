import { Router } from "express";
import { employeeCategoryController } from "../controllers/employee-category.controller";
import { requireAnyPermission, requirePermission } from "../middleware/company-context";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  createEmployeeCategorySchema,
  employeeCategoryIdParamSchema,
  listEmployeeCategoriesQuerySchema,
  updateEmployeeCategorySchema,
} from "../schemas/employee-category.schema";

export const employeeCategoryRouter = Router({ mergeParams: true });

employeeCategoryRouter.get(
  "/",
  validate(listEmployeeCategoriesQuerySchema, "query"),
  requireAnyPermission("employees:read", "company:read"),
  asyncHandler(employeeCategoryController.list),
);

employeeCategoryRouter.post(
  "/",
  validate(createEmployeeCategorySchema),
  requirePermission("company:settings:update"),
  asyncHandler(employeeCategoryController.create),
);

employeeCategoryRouter.patch(
  "/:categoryId",
  validate(employeeCategoryIdParamSchema, "params"),
  validate(updateEmployeeCategorySchema),
  requirePermission("company:settings:update"),
  asyncHandler(employeeCategoryController.update),
);
