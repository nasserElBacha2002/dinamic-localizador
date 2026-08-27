import { z } from "zod";

export const companyAlertRecipientIdParamSchema = z.object({
  companyId: z.string().uuid(),
  recipientId: z.string().uuid(),
});

/**
 * Prefer linking a company user (phone resolved from users.phone_number).
 * Legacy free-text phone remains supported when userId is omitted.
 */
export const createCompanyAlertRecipientSchema = z
  .object({
    userId: z.string().uuid().nullable().optional(),
    phoneNumber: z.string().min(8).optional(),
    displayName: z.string().max(200).nullable().optional(),
    isEnabled: z.boolean().optional(),
    receiveOperationalAlerts: z.boolean().optional(),
    receiveRequestAlerts: z.boolean().optional(),
    receiveSecurityAlerts: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.userId && !value.phoneNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Seleccioná un usuario de la empresa o indicá un teléfono.",
        path: ["userId"],
      });
    }
  });

export const updateCompanyAlertRecipientSchema = z.object({
  userId: z.string().uuid().nullable().optional(),
  phoneNumber: z.string().min(8).optional(),
  displayName: z.string().max(200).nullable().optional(),
  isEnabled: z.boolean().optional(),
  receiveOperationalAlerts: z.boolean().optional(),
  receiveRequestAlerts: z.boolean().optional(),
  receiveSecurityAlerts: z.boolean().optional(),
});

export type CreateCompanyAlertRecipientInput = z.infer<typeof createCompanyAlertRecipientSchema>;
export type UpdateCompanyAlertRecipientInput = z.infer<typeof updateCompanyAlertRecipientSchema>;
