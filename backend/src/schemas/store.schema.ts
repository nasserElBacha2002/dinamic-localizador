import { z } from "zod";
import { STORE_FORMATS } from "../constants/store-formats";
import { activeFilterSchema, paginationQuerySchema, searchFilterSchema } from "./common.schema";

const storeFormatSchema = z.enum(STORE_FORMATS);

export const createStoreSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  address: z.string().trim().max(300).optional().nullable(),
  neighborhood: z.string().trim().max(150).optional().nullable(),
  locality: z.string().trim().max(150).optional().nullable(),
  storeFormat: storeFormatSchema.optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowedRadiusMeters: z.number().int().positive().default(150),
  googlePlaceId: z.string().trim().max(255).optional().nullable(),
});

export const updateStoreSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    neighborhood: z.string().trim().max(150).nullable().optional(),
    locality: z.string().trim().max(150).nullable().optional(),
    storeFormat: storeFormatSchema.nullable().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    allowedRadiusMeters: z.number().int().positive().optional(),
    googlePlaceId: z.string().trim().max(255).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const storeIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const listStoresQuerySchema = paginationQuerySchema
  .merge(activeFilterSchema)
  .merge(searchFilterSchema);

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
export type UpdateStoreInput = z.infer<typeof updateStoreSchema>;
export type ListStoresQuery = z.infer<typeof listStoresQuerySchema>;
