import { z } from "zod";

export const payrollQueryDeliveryParamsSchema = z.object({
  companyId: z.string().uuid("companyId inválido"),
  deliveryId: z.string().uuid("deliveryId inválido"),
});

export const reconcilePayrollQueryDeliverySchema = z
  .object({
    commandId: z.string().uuid("commandId inválido"),
    expectedProcessingVersion: z.number().int().nonnegative(),
    resolution: z.enum(["CONFIRMED_ACCEPTED", "CONFIRMED_NOT_SENT"]),
    reason: z.string().trim().min(3).max(500),
    providerMessageSid: z.string().trim().min(3).max(100).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.resolution === "CONFIRMED_ACCEPTED" && !value.providerMessageSid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerMessageSid"],
        message: "providerMessageSid es obligatorio para confirmar el envío",
      });
    }
    if (value.resolution === "CONFIRMED_NOT_SENT" && value.providerMessageSid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["providerMessageSid"],
        message: "providerMessageSid no corresponde si no hubo envío",
      });
    }
  });
