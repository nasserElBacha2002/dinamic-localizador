import { z } from "zod";

export const assignEmployeeSchema = z.object({
  employeeId: z.string().uuid("UUID de empleado inválido"),
});

export const assignmentParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
});

export const unassignParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
  employeeId: z.string().uuid("UUID de empleado inválido"),
});

export type AssignEmployeeInput = z.infer<typeof assignEmployeeSchema>;
