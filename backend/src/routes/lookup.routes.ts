import { Router } from "express";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { lookupController } from "../controllers/lookup.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission } from "../middleware/company-context";
import { requireAnyCompanyModule } from "../middleware/require-company-module";
import { validate } from "../middleware/validate";
import {
  employeeLookupQuerySchema,
  operationLookupQuerySchema,
  serviceLookupQuerySchema,
} from "../schemas/lookup.schema";

export const lookupRouter = Router();

const readEmployeeLookups = requireAnyPermission(
  "employees:read",
  "attendance:read",
  "operations:read",
  "absences:read",
);

const readServiceLookups = requireAnyPermission(
  "services:read",
  "operations:read",
  "attendance:read",
);

const readOperationLookups = requireAnyPermission("operations:read", "attendance:read");

lookupRouter.get(
  "/employees",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.OPERATIONS,
    COMPANY_MODULE_KEYS.ABSENCES,
  ),
  readEmployeeLookups,
  validate(employeeLookupQuerySchema, "query"),
  asyncHandler(lookupController.listEmployees),
);

lookupRouter.get(
  "/workers",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.OPERATIONS,
    COMPANY_MODULE_KEYS.ABSENCES,
  ),
  readEmployeeLookups,
  validate(employeeLookupQuerySchema, "query"),
  asyncHandler(lookupController.listEmployees),
);

lookupRouter.get(
  "/services",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.OPERATIONS,
  ),
  readServiceLookups,
  validate(serviceLookupQuerySchema, "query"),
  asyncHandler(lookupController.listServices),
);

lookupRouter.get(
  "/operations",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.OPERATIONS,
  ),
  readOperationLookups,
  validate(operationLookupQuerySchema, "query"),
  asyncHandler(lookupController.listOperations),
);
