import { Router } from "express";
import { absenceBalanceController } from "../controllers/absence-balance.controller";
import { employeeController } from "../controllers/employee.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  absenceBalanceYearQuerySchema,
  employeeAbsenceBalanceParamsSchema,
  employeeIdRouteParamSchema,
  upsertEmployeeAbsenceBalanceSchema,
} from "../schemas/absence-balance.schema";
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "../schemas/employee.schema";

export const employeeRouter = Router();

employeeRouter.post("/", validate(createEmployeeSchema), asyncHandler(employeeController.create));
employeeRouter.get("/", validate(listEmployeesQuerySchema, "query"), asyncHandler(employeeController.list));
employeeRouter.get(
  "/:employeeId/absence-balances",
  validate(employeeIdRouteParamSchema, "params"),
  validate(absenceBalanceYearQuerySchema, "query"),
  asyncHandler(absenceBalanceController.listByEmployee),
);
employeeRouter.put(
  "/:employeeId/absence-balances/:absenceTypeId",
  validate(employeeAbsenceBalanceParamsSchema, "params"),
  validate(upsertEmployeeAbsenceBalanceSchema),
  asyncHandler(absenceBalanceController.upsert),
);
employeeRouter.get("/:id", validate(employeeIdParamSchema, "params"), asyncHandler(employeeController.getById));
employeeRouter.put(
  "/:id",
  validate(employeeIdParamSchema, "params"),
  validate(updateEmployeeSchema),
  asyncHandler(employeeController.update),
);
employeeRouter.delete(
  "/:id",
  validate(employeeIdParamSchema, "params"),
  asyncHandler(employeeController.deactivate),
);
