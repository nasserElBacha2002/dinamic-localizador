import { z } from "zod";
import { SERVICE_FORMAT_MAX_LENGTH } from "../types/service";

const serviceFormatSchema = z
  .string()
  .trim()
  .min(1, "Seleccioná un formato.")
  .max(SERVICE_FORMAT_MAX_LENGTH)
  .optional()
  .or(z.literal(""));

export const serviceFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  address: z.string().trim().optional().or(z.literal("")),
  neighborhood: z.string().trim().optional().or(z.literal("")),
  locality: z.string().trim().optional().or(z.literal("")),
  serviceFormat: z.union([serviceFormatSchema, z.literal("")]).optional(),
  latitude: z.number().min(-90, "Latitud mínima -90").max(90, "Latitud máxima 90"),
  longitude: z.number().min(-180, "Longitud mínima -180").max(180, "Longitud máxima 180"),
  allowedRadiusMeters: z.number().int().positive("El radio debe ser mayor que 0"),
  googlePlaceId: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
});

export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

export function toNullableServiceText(value: string | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function toNullableServiceFormat(value: ServiceFormValues["serviceFormat"]): string | null {
  if (!value) {
    return null;
  }

  return value;
}
