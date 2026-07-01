import { z } from "zod";
import { searchFilterSchema } from "./common.schema";

const lookupLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export const employeeLookupQuerySchema = lookupLimitSchema.merge(searchFilterSchema).extend({
  id: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
});

export const storeLookupQuerySchema = lookupLimitSchema.merge(searchFilterSchema).extend({
  id: z.string().uuid().optional(),
  active: z.coerce.boolean().optional(),
});

export const inventoryLookupQuerySchema = lookupLimitSchema.merge(searchFilterSchema).extend({
  id: z.string().uuid().optional(),
});

export type EmployeeLookupQuery = z.infer<typeof employeeLookupQuerySchema>;
export type StoreLookupQuery = z.infer<typeof storeLookupQuerySchema>;
export type InventoryLookupQuery = z.infer<typeof inventoryLookupQuerySchema>;
