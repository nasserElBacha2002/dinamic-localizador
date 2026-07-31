import { z } from "zod";
import { searchFilterSchema } from "./common.schema";
import {
  assertWithinMultiFilterLimit,
  mergeLegacySingularId,
  uuidIdListSchema,
} from "./uuid-id-list";

const lookupLimitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const withLookupIds = <T extends { id?: string; ids?: string[]; limit?: number }>(query: T) => {
  const ids = assertWithinMultiFilterLimit(
    mergeLegacySingularId(query.ids ?? [], query.id),
  );
  return {
    ...query,
    ids,
    limit: ids.length > 0 ? Math.max(query.limit ?? 20, Math.min(ids.length, 100)) : query.limit,
  };
};

export const employeeLookupQuerySchema = lookupLimitSchema
  .merge(searchFilterSchema)
  .extend({
    id: z.string().uuid().optional(),
    ids: uuidIdListSchema.optional(),
    active: z.coerce.boolean().optional(),
  })
  .transform(withLookupIds);

export const serviceLookupQuerySchema = lookupLimitSchema
  .merge(searchFilterSchema)
  .extend({
    id: z.string().uuid().optional(),
    ids: uuidIdListSchema.optional(),
    active: z.coerce.boolean().optional(),
  })
  .transform(withLookupIds);

export const operationLookupQuerySchema = lookupLimitSchema
  .merge(searchFilterSchema)
  .extend({
    id: z.string().uuid().optional(),
    ids: uuidIdListSchema.optional(),
  })
  .transform(withLookupIds);

export type EmployeeLookupQuery = z.infer<typeof employeeLookupQuerySchema>;
export type ServiceLookupQuery = z.infer<typeof serviceLookupQuerySchema>;
export type OperationLookupQuery = z.infer<typeof operationLookupQuerySchema>;
