import { z } from "zod";
import { STORE_FORMATS, type StoreFormat } from "../constants/store-formats";

const storeFormatSchema = z.enum(STORE_FORMATS);

export const storeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  address: z.string().trim().optional().or(z.literal("")),
  neighborhood: z.string().trim().optional().or(z.literal("")),
  locality: z.string().trim().optional().or(z.literal("")),
  storeFormat: z.union([storeFormatSchema, z.literal("")]).optional(),
  latitude: z.number().min(-90, "Latitud mínima -90").max(90, "Latitud máxima 90"),
  longitude: z.number().min(-180, "Longitud mínima -180").max(180, "Longitud máxima 180"),
  allowedRadiusMeters: z.number().int().positive("El radio debe ser mayor que 0"),
  googlePlaceId: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
});

export type StoreFormValues = z.infer<typeof storeFormSchema>;

export function toNullableStoreText(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function toNullableStoreFormat(value: StoreFormValues["storeFormat"]): StoreFormat | null {
  if (!value) {
    return null;
  }

  return value;
}
