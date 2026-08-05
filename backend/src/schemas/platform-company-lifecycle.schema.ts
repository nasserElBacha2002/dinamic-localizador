import { z } from "zod";

export const deactivatePlatformCompanySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "El motivo de desactivación es obligatorio")
    .max(500, "El motivo no puede superar 500 caracteres"),
});

export type DeactivatePlatformCompanyInput = z.infer<typeof deactivatePlatformCompanySchema>;

export const companyIdParamsSchema = z.object({
  companyId: z.string().uuid("companyId inválido"),
});
