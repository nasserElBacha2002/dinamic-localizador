import { z } from "zod";
import { paginationQuerySchema } from "./common.schema";

const operationWorkdayStatusSchema = z.enum(["ACTIVE", "CANCELLED"]);

export const operationWorkdayIdParamSchema = z.object({
  id: z.string().uuid(),
  workdayId: z.string().uuid(),
});

export const listOperationWorkdaysQuerySchema = paginationQuerySchema.extend({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: operationWorkdayStatusSchema.optional(),
});

export type ListOperationWorkdaysQuery = z.infer<typeof listOperationWorkdaysQuerySchema>;
