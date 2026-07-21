import { z } from "zod";
import { EMPLOYEE_TYPES } from "../constants/employee-types";
import {
  activeFilterSchema,
  paginationQuerySchema,
  searchFilterSchema,
  tableSortSchema,
} from "./common.schema";

const employeeTypeSchema = z.enum(EMPLOYEE_TYPES, {
  message: "Seleccioná un tipo de empleado válido",
});

const categoryIdSchema = z.string().uuid("UUID de categoría inválido").nullable();

export const EMPLOYEE_LIST_SORT_FIELDS = [
  "name",
  "documentNumber",
  "phoneNumber",
  "category",
  "employeeType",
  "active",
] as const;

export type EmployeeListSortField = (typeof EMPLOYEE_LIST_SORT_FIELDS)[number];

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  documentNumber: z.string().trim().max(50).optional().nullable(),
  phoneNumber: z.string().trim().min(8, "El teléfono es obligatorio").max(30),
  employeeType: employeeTypeSchema,
  categoryId: categoryIdSchema.optional(),
});

export const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    documentNumber: z.string().trim().max(50).nullable().optional(),
    phoneNumber: z.string().trim().min(8).max(30).optional(),
    employeeType: employeeTypeSchema.optional(),
    categoryId: categoryIdSchema.optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const employeeIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const deactivateEmployeeSchema = z.object({
  confirmAffectedRelease: z.boolean().optional().default(false),
  profile: z
    .object({
      name: z.string().trim().min(1).max(150).optional(),
      documentNumber: z.string().trim().max(50).nullable().optional(),
      phoneNumber: z.string().trim().min(8).max(30).optional(),
      employeeType: employeeTypeSchema.optional(),
      categoryId: categoryIdSchema.optional(),
    })
    .optional(),
});

export type DeactivateEmployeeBody = z.infer<typeof deactivateEmployeeSchema>;

export const listEmployeesQuerySchema = paginationQuerySchema
  .merge(activeFilterSchema)
  .merge(searchFilterSchema)
  .merge(tableSortSchema)
  .extend({
    categoryId: z
      .union([z.literal("none"), z.string().uuid("UUID de categoría inválido")])
      .optional(),
    sortBy: z.enum(EMPLOYEE_LIST_SORT_FIELDS).optional(),
  });

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
