import { z } from "zod";

export const uuidSchema = z.string().uuid("UUID inválido");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const activeFilterSchema = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export const searchFilterSchema = z.object({
  search: z.string().trim().min(1).optional(),
});

export const dateRangeSchema = z.object({
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
});
