import { z } from "zod";
import { COMPANY_ABSENCE_SETTINGS_LIMITS } from "../constants/company-absence";

const absenceSettingItemSchema = z.object({
  absenceTypeCode: z
    .string()
    .trim()
    .min(1, "El código de tipo de ausencia es obligatorio.")
    .max(40, "El código de tipo de ausencia no puede superar 40 caracteres."),
  defaultAnnualDays: z.coerce
    .number()
    .min(
      COMPANY_ABSENCE_SETTINGS_LIMITS.defaultAnnualDays.min,
      "Los días anuales por defecto no pueden ser negativos.",
    )
    .max(
      COMPANY_ABSENCE_SETTINGS_LIMITS.defaultAnnualDays.max,
      "Los días anuales por defecto no pueden superar 365.",
    ),
  autoAssignOnEmployeeCreate: z.boolean(),
});

export const updateCompanyAbsenceSettingsSchema = z
  .object({
    settings: z
      .array(absenceSettingItemSchema)
      .min(1, "Debe enviar al menos un tipo de ausencia."),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, setting] of value.settings.entries()) {
      const normalized = setting.absenceTypeCode.trim().toUpperCase();
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: "custom",
          message: `El tipo de ausencia ${setting.absenceTypeCode} está duplicado en la solicitud.`,
          path: ["settings", index, "absenceTypeCode"],
        });
        continue;
      }
      seen.add(normalized);
    }
  });

export type UpdateCompanyAbsenceSettingsInput = z.infer<typeof updateCompanyAbsenceSettingsSchema>;
