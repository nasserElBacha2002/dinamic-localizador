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

export type UpsertEmployeeAbsenceBalanceInput = z.infer<typeof upsertEmployeeAbsenceBalanceSchema>;
