import { z } from "zod";
import { activeFilterSchema, paginationQuerySchema, searchFilterSchema } from "./common.schema";

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  documentNumber: z.string().trim().max(50).optional().nullable(),
  phoneNumber: z.string().trim().min(8, "El teléfono es obligatorio").max(30),
});

export const updateEmployeeSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    documentNumber: z.string().trim().max(50).nullable().optional(),
    phoneNumber: z.string().trim().min(8).max(30).optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const employeeIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const listEmployeesQuerySchema = paginationQuerySchema
  .merge(activeFilterSchema)
  .merge(searchFilterSchema);

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
