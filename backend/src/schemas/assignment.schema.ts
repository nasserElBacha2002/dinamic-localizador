import { z } from "zod";

export const assignEmployeeSchema = z.object({
  employeeId: z.string().uuid("UUID de empleado inválido"),
  validFrom: z.string().date("Fecha de inicio inválida").optional(),
  validUntil: z.string().date("Fecha de fin inválida").nullable().optional(),
});

export const assignmentParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
});

export const assignmentMemberParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
  assignmentId: z.string().uuid("UUID de asignación inválido"),
});

export const endAssignmentSchema = z.object({
  effectiveDate: z.string().date("Fecha efectiva inválida"),
});

export type AssignEmployeeInput = z.infer<typeof assignEmployeeSchema>;
export type EndAssignmentInput = z.infer<typeof endAssignmentSchema>;
