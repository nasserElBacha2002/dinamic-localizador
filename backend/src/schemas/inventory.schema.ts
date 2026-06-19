import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema } from "./common.schema";

const inventoryStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const createInventorySchema = z
  .object({
    storeId: z.string().uuid("UUID de tienda inválido"),
    scheduledStart: z.string().datetime({ offset: true }),
    scheduledEnd: z.string().datetime({ offset: true }).optional().nullable(),
    earlyToleranceMinutes: z.number().int().min(0).default(60),
    lateToleranceMinutes: z.number().int().min(0).default(90),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      if (!data.scheduledEnd) {
        return true;
      }

      return new Date(data.scheduledEnd) > new Date(data.scheduledStart);
    },
    {
      message: "scheduledEnd debe ser posterior a scheduledStart",
      path: ["scheduledEnd"],
    },
  );

export const updateInventorySchema = z
  .object({
    storeId: z.string().uuid().optional(),
    scheduledStart: z.string().datetime({ offset: true }).optional(),
    scheduledEnd: z.string().datetime({ offset: true }).nullable().optional(),
    earlyToleranceMinutes: z.number().int().min(0).optional(),
    lateToleranceMinutes: z.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    status: inventoryStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const inventoryIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const inventoryAttendanceSummaryQuerySchema = paginationQuerySchema;

export const listInventoriesQuerySchema = paginationQuerySchema.merge(dateRangeSchema).extend({
  status: inventoryStatusSchema.optional(),
  storeId: z.string().uuid().optional(),
});

export type CreateInventoryInput = z.infer<typeof createInventorySchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type ListInventoriesQuery = z.infer<typeof listInventoriesQuerySchema>;
