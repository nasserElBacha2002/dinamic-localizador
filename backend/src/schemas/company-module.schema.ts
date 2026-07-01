import { z } from "zod";
import { ALL_COMPANY_MODULE_KEYS } from "../constants/company-modules";

const companyModuleUpdateItemSchema = z.object({
  moduleKey: z.enum(ALL_COMPANY_MODULE_KEYS, {
    error: "Clave de módulo inválida.",
  }),
  isEnabled: z.boolean(),
});

export const updateCompanyModulesSchema = z
  .object({
    modules: z
      .array(companyModuleUpdateItemSchema)
      .min(1, "Debe enviar al menos un módulo para actualizar."),
  })
  .superRefine((value, ctx) => {
    const keys = value.modules.map((module) => module.moduleKey);
    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "No se permiten claves de módulo duplicadas.",
        path: ["modules"],
      });
    }
  });

export type UpdateCompanyModulesInput = z.infer<typeof updateCompanyModulesSchema>;
