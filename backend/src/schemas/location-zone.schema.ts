import { z } from "zod";

const optionalCentroid = z.number().finite().nullable().optional();

export const createLocationZoneSchema = z
  .object({
    name: z.string().trim().min(1, "El nombre de la zona es obligatorio").max(120),
    locality: z.string().trim().max(120).nullable().optional(),
    centroidLatitude: optionalCentroid,
    centroidLongitude: optionalCentroid,
  })
  .superRefine((data, ctx) => {
    const lat = data.centroidLatitude;
    const lon = data.centroidLongitude;
    const hasLat = lat !== undefined && lat !== null;
    const hasLon = lon !== undefined && lon !== null;
    if (hasLat !== hasLon) {
      ctx.addIssue({
        code: "custom",
        message: "Latitud y longitud del centroide deben enviarse juntas.",
        path: hasLat ? ["centroidLongitude"] : ["centroidLatitude"],
      });
    }
    if (hasLat && (lat! < -90 || lat! > 90)) {
      ctx.addIssue({
        code: "custom",
        message: "La latitud del centroide debe estar entre -90 y 90.",
        path: ["centroidLatitude"],
      });
    }
    if (hasLon && (lon! < -180 || lon! > 180)) {
      ctx.addIssue({
        code: "custom",
        message: "La longitud del centroide debe estar entre -180 y 180.",
        path: ["centroidLongitude"],
      });
    }
  });

export const updateLocationZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    locality: z.string().trim().max(120).nullable().optional(),
    centroidLatitude: optionalCentroid,
    centroidLongitude: optionalCentroid,
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })
  .superRefine((data, ctx) => {
    const latDefined = data.centroidLatitude !== undefined;
    const lonDefined = data.centroidLongitude !== undefined;
    if (latDefined !== lonDefined) {
      ctx.addIssue({
        code: "custom",
        message: "Latitud y longitud del centroide deben enviarse juntas.",
        path: latDefined ? ["centroidLongitude"] : ["centroidLatitude"],
      });
      return;
    }
    const lat = data.centroidLatitude;
    const lon = data.centroidLongitude;
    if (latDefined && lonDefined) {
      const bothNull = lat === null && lon === null;
      const bothSet = lat !== null && lon !== null;
      if (!bothNull && !bothSet) {
        ctx.addIssue({
          code: "custom",
          message: "Latitud y longitud del centroide deben enviarse juntas.",
          path: ["centroidLongitude"],
        });
      }
      if (typeof lat === "number" && (lat < -90 || lat > 90)) {
        ctx.addIssue({
          code: "custom",
          message: "La latitud del centroide debe estar entre -90 y 90.",
          path: ["centroidLatitude"],
        });
      }
      if (typeof lon === "number" && (lon < -180 || lon > 180)) {
        ctx.addIssue({
          code: "custom",
          message: "La longitud del centroide debe estar entre -180 y 180.",
          path: ["centroidLongitude"],
        });
      }
    }
  });

export const locationZoneIdParamSchema = z.object({
  zoneId: z.string().uuid("UUID de zona inválido"),
});

export const listLocationZonesQuerySchema = z.object({
  includeInactive: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export type CreateLocationZoneInput = z.infer<typeof createLocationZoneSchema>;
export type UpdateLocationZoneInput = z.infer<typeof updateLocationZoneSchema>;
export type ListLocationZonesQuery = z.infer<typeof listLocationZonesQuerySchema>;
