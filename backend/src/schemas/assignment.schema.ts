import { z } from "zod";

export const assignEmployeeSchema = z.object({
  employeeId: z.string().uuid("UUID de empleado inválido"),
});

export const assignmentParamsSchema = z.object({
  inventoryId: z.string().uuid("UUID de inventario inválido"),
});

export const unassignParamsSchema = z.object({
  inventoryId: z.string().uuid("UUID de inventario inválido"),
  employeeId: z.string().uuid("UUID de empleado inválido"),
});

export type AssignEmployeeInput = z.infer<typeof assignEmployeeSchema>;
