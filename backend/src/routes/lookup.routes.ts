import { Router } from "express";
import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { lookupController } from "../controllers/lookup.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission } from "../middleware/company-context";
import { requireAnyCompanyModule } from "../middleware/require-company-module";
import { validate } from "../middleware/validate";
import {
  employeeLookupQuerySchema,
  inventoryLookupQuerySchema,
  storeLookupQuerySchema,
} from "../schemas/lookup.schema";

export const lookupRouter = Router();

const readEmployeeLookups = requireAnyPermission(
  "employees:read",
  "attendance:read",
  "inventories:read",
  "absences:read",
);

const readStoreLookups = requireAnyPermission(
  "stores:read",
  "inventories:read",
  "attendance:read",
);

const readInventoryLookups = requireAnyPermission("inventories:read", "attendance:read");

lookupRouter.get(
  "/employees",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS,
    COMPANY_MODULE_KEYS.ABSENCES,
  ),
  readEmployeeLookups,
  validate(employeeLookupQuerySchema, "query"),
  asyncHandler(lookupController.listEmployees),
);

lookupRouter.get(
  "/stores",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS,
  ),
  readStoreLookups,
  validate(storeLookupQuerySchema, "query"),
  asyncHandler(lookupController.listStores),
);

lookupRouter.get(
  "/inventories",
  requireAnyCompanyModule(
    COMPANY_MODULE_KEYS.ATTENDANCE,
    COMPANY_MODULE_KEYS.INVENTORY_OPERATIONS,
  ),
  readInventoryLookups,
  validate(inventoryLookupQuerySchema, "query"),
  asyncHandler(lookupController.listInventories),
);
