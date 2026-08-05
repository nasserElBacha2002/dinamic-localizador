import { z } from "zod";

export const componentStatusSchema = z.enum(["ok", "error"]);
export const gcsComponentStatusSchema = z.enum(["ok", "degraded", "error", "disabled"]);
export const overallStatusSchema = z.enum(["ok", "degraded", "error"]);

export const platformServerStatusSchema = z.object({
  status: overallStatusSchema,
  backend: z.object({
    status: z.literal("ok"),
    service: z.string().min(1),
    checkedAt: z.string().min(1),
  }),
  database: z.object({
    status: componentStatusSchema,
    message: z.string().nullable(),
    durationMs: z.number().nonnegative(),
    checkedAt: z.string().min(1),
  }),
  gcs: z.object({
    status: gcsComponentStatusSchema,
    message: z.string().nullable(),
    durationMs: z.number().nonnegative(),
    checkedAt: z.string().min(1),
  }),
  timestamp: z.string().min(1),
});

export type PlatformServerStatusDto = z.infer<typeof platformServerStatusSchema>;
