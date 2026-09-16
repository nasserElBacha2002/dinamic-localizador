import { z } from "zod";
import { isValidReportEmail, normalizeReportEmail } from "../utils/daily-attendance-report-email";

export const companyReportEmailRecipientIdParamSchema = z.object({
  companyId: z.string().uuid("ID de empresa inválido"),
  recipientId: z.string().uuid("ID de destinatario inválido"),
});

export const createCompanyReportEmailRecipientSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5)
    .max(320)
    .transform(normalizeReportEmail)
    .refine(isValidReportEmail, { message: "El email no es válido." }),
  displayName: z.string().trim().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export const updateCompanyReportEmailRecipientSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(5)
      .max(320)
      .transform(normalizeReportEmail)
      .refine(isValidReportEmail, { message: "El email no es válido." })
      .optional(),
    displayName: z.string().trim().max(200).nullable().optional(),
    isEnabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar.",
  });

export type CreateCompanyReportEmailRecipientInput = z.infer<
  typeof createCompanyReportEmailRecipientSchema
>;
export type UpdateCompanyReportEmailRecipientInput = z.infer<
  typeof updateCompanyReportEmailRecipientSchema
>;
