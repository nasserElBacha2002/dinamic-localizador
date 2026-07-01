import { z } from "zod";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { COMPANY_STATUSES } from "../types/company";

const companySettingsInputSchema = z.object({
  operationTimezone: z.string().trim().min(1).optional(),
  defaultRadiusMeters: z.coerce.number().int().positive().optional(),
  lateGraceMinutes: z.coerce.number().int().nonnegative().optional(),
  earlyLeaveToleranceMinutes: z.coerce.number().int().nonnegative().optional(),
  requireCheckoutLocation: z.boolean().optional(),
  allowManualAttendanceCorrections: z.boolean().optional(),
});

const ownerInputSchema = z.object({
  name: z.string().trim().min(1, "El nombre del owner es obligatorio").max(150),
  email: z.string().trim().email("Email inválido").max(255),
  temporaryPassword: z
    .string()
    .min(8, "La contraseña temporal debe tener al menos 8 caracteres")
    .optional(),
});

export const createPlatformCompanySchema = z.object({
  name: z.string().trim().min(1, "El nombre de la empresa es obligatorio").max(200),
  defaultTimezone: z
    .string()
    .trim()
    .min(1)
    .default("America/Argentina/Buenos_Aires"),
  status: z.enum(COMPANY_STATUSES).optional().default("ACTIVE"),
  settings: companySettingsInputSchema.optional(),
  modules: z
    .array(z.enum(ALL_COMPANY_MODULE_KEYS))
    .optional()
    .default([...ALL_COMPANY_MODULE_KEYS]),
  owner: ownerInputSchema,
});

export type CreatePlatformCompanyInput = z.infer<typeof createPlatformCompanySchema>;
