import { z } from "zod";
import { COMPANY_MEMBERSHIP_STATUSES, COMPANY_ROLES } from "../types/company";
import { paginationQuerySchema, searchFilterSchema } from "./common.schema";

export const companyUserIdParamSchema = z.object({
  userId: z.string().uuid("UUID de usuario inválido"),
});

export const listCompanyUsersQuerySchema = paginationQuerySchema.merge(searchFilterSchema).extend({
  role: z.enum(COMPANY_ROLES).optional(),
  status: z.enum(COMPANY_MEMBERSHIP_STATUSES).optional(),
});

export const createCompanyUserSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  email: z.string().trim().email("Email inválido").max(255),
  role: z.enum(COMPANY_ROLES, { message: "Rol de empresa inválido" }),
  status: z.enum(COMPANY_MEMBERSHIP_STATUSES).optional().default("ACTIVE"),
  temporaryPassword: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres").optional(),
  isDefault: z.boolean().optional(),
});

export const updateCompanyUserSchema = z
  .object({
    role: z.enum(COMPANY_ROLES, { message: "Rol de empresa inválido" }).optional(),
    status: z.enum(COMPANY_MEMBERSHIP_STATUSES).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Debe enviar al menos un campo para actualizar.",
  });

export type ListCompanyUsersQuery = z.infer<typeof listCompanyUsersQuerySchema>;
export type CreateCompanyUserInput = z.infer<typeof createCompanyUserSchema>;
export type UpdateCompanyUserInput = z.infer<typeof updateCompanyUserSchema>;
