import { z } from "zod";

export const companyAlertRecipientIdParamSchema = z.object({
  companyId: z.string().uuid(),
  recipientId: z.string().uuid(),
});

export const createCompanyAlertRecipientSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  phoneNumber: z.string().min(8, "El teléfono es obligatorio."),
  displayName: z.string().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
  receiveOperationalAlerts: z.boolean().optional(),
  receiveRequestAlerts: z.boolean().optional(),
  receiveSecurityAlerts: z.boolean().optional(),
});

export const updateCompanyAlertRecipientSchema = createCompanyAlertRecipientSchema.partial();

export type CreateCompanyAlertRecipientInput = z.infer<typeof createCompanyAlertRecipientSchema>;
export type UpdateCompanyAlertRecipientInput = z.infer<typeof updateCompanyAlertRecipientSchema>;
