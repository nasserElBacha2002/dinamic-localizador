import { z } from "zod";

export const companyIdParamSchema = z.object({
  companyId: z.string().uuid("ID de empresa inválido"),
});

export const updateCompanySettingsSchema = z
  .object({
    operationTimezone: z.string().min(1).optional(),
    defaultRadiusMeters: z.coerce.number().int().positive().optional(),
    lateGraceMinutes: z.coerce.number().int().nonnegative().optional(),
    earlyLeaveToleranceMinutes: z.coerce.number().int().nonnegative().optional(),
    requireCheckoutLocation: z.boolean().optional(),
    allowManualAttendanceCorrections: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar.",
  });

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
