import { z } from "zod";
import {
  COMPANY_SETTINGS_LIMITS,
  isValidOperationTimezone,
} from "../constants/company-settings";

export const companyIdParamSchema = z.object({
  companyId: z.string().uuid("ID de empresa inválido"),
});

export const updateCompanySettingsSchema = z
  .object({
    operationTimezone: z
      .string()
      .trim()
      .min(1, "La zona horaria operativa es obligatoria.")
      .max(
        COMPANY_SETTINGS_LIMITS.operationTimezoneMaxLength,
        "La zona horaria no puede superar 80 caracteres.",
      )
      .optional(),
    defaultRadiusMeters: z.coerce
      .number()
      .int("El radio predeterminado debe ser un número entero.")
      .min(
        COMPANY_SETTINGS_LIMITS.defaultRadiusMeters.min,
        "El radio predeterminado debe ser al menos 10 metros.",
      )
      .max(
        COMPANY_SETTINGS_LIMITS.defaultRadiusMeters.max,
        "El radio predeterminado no puede superar 5000 metros.",
      )
      .optional(),
    lateGraceMinutes: z.coerce
      .number()
      .int("La tolerancia de llegada debe ser un número entero.")
      .min(
        COMPANY_SETTINGS_LIMITS.lateGraceMinutes.min,
        "La tolerancia de llegada no puede ser negativa.",
      )
      .max(
        COMPANY_SETTINGS_LIMITS.lateGraceMinutes.max,
        "La tolerancia de llegada no puede superar 240 minutos.",
      )
      .optional(),
    earlyLeaveToleranceMinutes: z.coerce
      .number()
      .int("La tolerancia de salida anticipada debe ser un número entero.")
      .min(
        COMPANY_SETTINGS_LIMITS.earlyLeaveToleranceMinutes.min,
        "La tolerancia de salida anticipada no puede ser negativa.",
      )
      .max(
        COMPANY_SETTINGS_LIMITS.earlyLeaveToleranceMinutes.max,
        "La tolerancia de salida anticipada no puede superar 240 minutos.",
      )
      .optional(),
    requireCheckoutLocation: z.boolean().optional(),
    allowManualAttendanceCorrections: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar.",
  })
  .superRefine((value, ctx) => {
    if (
      value.operationTimezone !== undefined &&
      !isValidOperationTimezone(value.operationTimezone)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "La zona horaria operativa no es válida.",
        path: ["operationTimezone"],
      });
    }
  });

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
