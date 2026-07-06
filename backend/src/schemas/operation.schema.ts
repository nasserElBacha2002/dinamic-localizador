import { z } from "zod";
import { dateRangeSchema, paginationQuerySchema, searchFilterSchema, tableSortSchema } from "./common.schema";

const operationStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const createOperationSchema = z
  .object({
    serviceId: z.string().uuid("UUID de servicio inválido"),
    scheduledStart: z.string().datetime({ offset: true }),
    scheduledEnd: z.string().datetime({ offset: true }).optional().nullable(),
    earlyToleranceMinutes: z.number().int().min(0).optional(),
    lateToleranceMinutes: z.number().int().min(0).optional(),
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

export const updateOperationSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    scheduledStart: z.string().datetime({ offset: true }).optional(),
    scheduledEnd: z.string().datetime({ offset: true }).nullable().optional(),
    earlyToleranceMinutes: z.number().int().min(0).optional(),
    lateToleranceMinutes: z.number().int().min(0).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    status: operationStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const operationIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const operationAttendanceSummaryQuerySchema = paginationQuerySchema;

export const listOperationsQuerySchema = paginationQuerySchema
  .merge(dateRangeSchema)
  .merge(searchFilterSchema)
  .merge(tableSortSchema)
  .extend({
    status: operationStatusSchema.optional(),
    serviceId: z.string().uuid().optional(),
  });

export type CreateOperationInput = z.infer<typeof createOperationSchema>;
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;
export type ListOperationsQuery = z.infer<typeof listOperationsQuerySchema>;
