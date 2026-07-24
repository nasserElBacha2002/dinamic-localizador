import { z } from "zod";
import { EMPLOYEE_CATEGORY_NAME_MAX_LENGTH } from "../utils/normalize-category-name";

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre de la categoría es obligatorio")
  .max(
    EMPLOYEE_CATEGORY_NAME_MAX_LENGTH,
    `El nombre no puede superar ${EMPLOYEE_CATEGORY_NAME_MAX_LENGTH} caracteres`,
  );

export const createEmployeeCategorySchema = z.object({
  name: categoryNameSchema,
});

export const updateEmployeeCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const employeeCategoryIdParamSchema = z.object({
  categoryId: z.string().uuid("UUID inválido"),
});

export const listEmployeeCategoriesQuerySchema = z.object({
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
    .pipe(z.boolean()),
});

export type CreateEmployeeCategoryInput = z.infer<typeof createEmployeeCategorySchema>;
export type UpdateEmployeeCategoryInput = z.infer<typeof updateEmployeeCategorySchema>;
export type ListEmployeeCategoriesQuery = z.infer<typeof listEmployeeCategoriesQuerySchema>;
