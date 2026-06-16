import { z } from "zod";

export const storeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  address: z.string().trim().optional().or(z.literal("")),
  latitude: z.number().min(-90, "Latitud mínima -90").max(90, "Latitud máxima 90"),
  longitude: z.number().min(-180, "Longitud mínima -180").max(180, "Longitud máxima 180"),
  allowedRadiusMeters: z.number().int().positive("El radio debe ser mayor que 0"),
  googlePlaceId: z.string().trim().optional().or(z.literal("")),
  active: z.boolean(),
});

export type StoreFormValues = z.infer<typeof storeFormSchema>;
