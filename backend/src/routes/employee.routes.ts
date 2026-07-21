import { Router } from "express";
import { absenceBalanceController } from "../controllers/absence-balance.controller";
import { employeeController } from "../controllers/employee.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  absenceBalanceYearQuerySchema,
  employeeAbsenceBalanceParamsSchema,
  employeeIdRouteParamSchema,
  upsertEmployeeAbsenceBalanceSchema,
} from "../schemas/absence-balance.schema";
import {
  createEmployeeSchema,
  deactivateEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "../schemas/employee.schema";

export const employeeRouter = Router();

employeeRouter.post(
  "/",
  requirePermission("employees:manage"),
  validate(createEmployeeSchema),
  asyncHandler(employeeController.create),
);
employeeRouter.get(
  "/",
  requirePermission("employees:read"),
  validate(listEmployeesQuerySchema, "query"),
  asyncHandler(employeeController.list),
);
employeeRouter.get(
  "/:employeeId/absence-balances",
  requirePermission("absences:read"),
  validate(employeeIdRouteParamSchema, "params"),
  validate(absenceBalanceYearQuerySchema, "query"),
  asyncHandler(absenceBalanceController.listByEmployee),
);
employeeRouter.put(
  "/:employeeId/absence-balances/:absenceTypeId",
  requirePermission("absences:review"),
  validate(employeeAbsenceBalanceParamsSchema, "params"),
  validate(upsertEmployeeAbsenceBalanceSchema),
  asyncHandler(absenceBalanceController.upsert),
);
employeeRouter.get(
  "/:id/deactivation-impact",
  requirePermission("employees:manage"),
  validate(employeeIdParamSchema, "params"),
  asyncHandler(employeeController.getDeactivationImpact),
);
employeeRouter.post(
  "/:id/deactivate",
  requirePermission("employees:manage"),
  validate(employeeIdParamSchema, "params"),
  validate(deactivateEmployeeSchema),
  asyncHandler(employeeController.deactivate),
);
employeeRouter.get(
  "/:id",
  requirePermission("employees:read"),
  validate(employeeIdParamSchema, "params"),
  asyncHandler(employeeController.getById),
);
employeeRouter.put(
  "/:id",
  requirePermission("employees:manage"),
  validate(employeeIdParamSchema, "params"),
  validate(updateEmployeeSchema),
  asyncHandler(employeeController.update),
);
employeeRouter.delete(
  "/:id",
  requirePermission("employees:manage"),
  validate(employeeIdParamSchema, "params"),
  asyncHandler(employeeController.deactivate),
);
