import { z } from "zod";
import { activeFilterSchema, paginationQuerySchema, searchFilterSchema, tableSortSchema } from "./common.schema";
import { SERVICE_FORMAT_MAX_LENGTH } from "../utils/normalize-optional-text";

const serviceFormatSchema = z
  .string()
  .trim()
  .min(1, "El formato no puede estar vacío.")
  .max(SERVICE_FORMAT_MAX_LENGTH, `El formato no puede superar ${SERVICE_FORMAT_MAX_LENGTH} caracteres.`);

export const SERVICE_LIST_SORT_FIELDS = [
  "name",
  "neighborhood",
  "locality",
  "serviceFormat",
  "address",
  "active",
  "createdAt",
] as const;

export type ServiceListSortField = (typeof SERVICE_LIST_SORT_FIELDS)[number];

export const createServiceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  address: z.string().trim().max(300).optional().nullable(),
  neighborhood: z.string().trim().max(150).optional().nullable(),
  locality: z.string().trim().max(150).optional().nullable(),
  serviceFormat: serviceFormatSchema.optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowedRadiusMeters: z.number().int().positive().default(150),
  googlePlaceId: z.string().trim().max(255).optional().nullable(),
});

export const updateServiceSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    address: z.string().trim().max(300).nullable().optional(),
    neighborhood: z.string().trim().max(150).nullable().optional(),
    locality: z.string().trim().max(150).nullable().optional(),
    serviceFormat: serviceFormatSchema.nullable().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    allowedRadiusMeters: z.number().int().positive().optional(),
    googlePlaceId: z.string().trim().max(255).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const serviceIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const listServicesQuerySchema = paginationQuerySchema
  .merge(activeFilterSchema)
  .merge(searchFilterSchema)
  .merge(tableSortSchema)
  .extend({
    serviceFormat: z.string().trim().min(1).max(SERVICE_FORMAT_MAX_LENGTH).optional(),
    locality: z.string().trim().min(1).max(150).optional(),
    neighborhood: z.string().trim().min(1).max(150).optional(),
    sortBy: z.enum(SERVICE_LIST_SORT_FIELDS).optional(),
  });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
