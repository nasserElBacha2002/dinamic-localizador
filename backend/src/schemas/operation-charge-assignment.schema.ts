import { z } from "zod";

export const operationChargeParamsSchema = z.object({
  operationId: z.string().uuid("UUID de operación inválido"),
});

export const operationChargeAssignmentIdParamsSchema = operationChargeParamsSchema.extend({
  assignmentId: z.string().uuid(),
});

export const createOperationChargeAssignmentSchema = z.object({
  userId: z.string().uuid("UUID de usuario inválido"),
  validFrom: z.string().date("Fecha de inicio inválida"),
  validUntil: z.string().date("Fecha de fin inválida").nullable().optional(),
});

export const endOperationChargeAssignmentSchema = z.object({
  effectiveDate: z.string().date("Fecha de fin inválida"),
});

export const listOperationChargeByUserQuerySchema = z.object({
  userId: z.string().uuid(),
});
