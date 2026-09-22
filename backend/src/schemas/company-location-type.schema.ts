import { z } from "zod";
import { companyIdParamSchema } from "./company.schema";

export const listCompanyLocationTypesQuerySchema = z.object({
  activeOnly: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export const listClientLocationTypesQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const companyLocationTypeIdParamSchema = companyIdParamSchema.extend({
  locationTypeId: z.string().uuid("UUID inválido"),
});

export const clientLocationTypeParamsSchema = z.object({
  clientId: z.string().uuid("UUID inválido"),
  locationTypeId: z.string().uuid("UUID inválido").optional(),
});

export const createCompanyLocationTypeSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(200),
  code: z.string().trim().min(1).max(80).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

export const updateCompanyLocationTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    code: z.string().trim().min(1).max(80).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar.",
  });

export type CreateCompanyLocationTypeInput = z.infer<typeof createCompanyLocationTypeSchema>;
export type UpdateCompanyLocationTypeInput = z.infer<typeof updateCompanyLocationTypeSchema>;
export type ListClientLocationTypesQuery = z.infer<typeof listClientLocationTypesQuerySchema>;
