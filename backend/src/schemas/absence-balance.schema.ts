import { z } from "zod";

export const absenceBalanceYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const employeeIdRouteParamSchema = z.object({
  employeeId: z.string().uuid("UUID de empleado inválido"),
});

export const employeeAbsenceBalanceParamsSchema = employeeIdRouteParamSchema.extend({
  absenceTypeId: z.string().uuid("UUID de tipo de ausencia inválido"),
});

export const upsertEmployeeAbsenceBalanceSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  totalDays: z.coerce.number().min(0),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const adjustEmployeeAbsenceBalanceSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  quantity: z.coerce.number().positive(),
  operation: z.enum(["CREDIT", "DEBIT"]),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

export const listAbsenceBalanceMovementsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  movementType: z
    .enum([
      "INITIAL_GRANT",
      "MANUAL_CREDIT",
      "MANUAL_DEBIT",
      "RESERVE",
      "RELEASE",
      "CONSUME",
      "REVERSAL",
      "MIGRATION_ADJUSTMENT",
    ])
    .optional(),
});

export type UpsertEmployeeAbsenceBalanceInput = z.infer<typeof upsertEmployeeAbsenceBalanceSchema>;
export type AdjustEmployeeAbsenceBalanceInput = z.infer<typeof adjustEmployeeAbsenceBalanceSchema>;
