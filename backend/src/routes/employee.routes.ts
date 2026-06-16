import { Router } from "express";
import { employeeController } from "../controllers/employee.controller";
import { asyncHandler } from "../middleware/async-handler";
import { validate } from "../middleware/validate";
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesQuerySchema,
  updateEmployeeSchema,
} from "../schemas/employee.schema";

export const employeeRouter = Router();

employeeRouter.post("/", validate(createEmployeeSchema), asyncHandler(employeeController.create));
employeeRouter.get("/", validate(listEmployeesQuerySchema, "query"), asyncHandler(employeeController.list));
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
