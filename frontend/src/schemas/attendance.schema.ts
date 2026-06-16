import { z } from "zod";

export const attendanceTestFormSchema = z.object({
  inventoryId: z.string().uuid("Seleccioná un inventario"),
  employeeId: z.string().uuid("Seleccioná un empleado"),
  receivedLatitude: z.number().min(-90).max(90),
  receivedLongitude: z.number().min(-180).max(180),
  distanceMeters: z.number().min(0),
  validationStatus: z.enum(["VALID", "PENDING_REVIEW", "REJECTED"]),
  locationStatus: z.enum(["INSIDE_GEOFENCE", "OUTSIDE_GEOFENCE", "INVALID_LOCATION"]),
  punctualityStatus: z.enum(["EARLY", "ON_TIME", "LATE", "OUTSIDE_TIME_WINDOW"]),
  receivedAt: z.string().min(1, "La fecha es obligatoria"),
  sourceMessageSid: z.string().optional().or(z.literal("")),
  validationReason: z.string().optional().or(z.literal("")),
});

export type AttendanceTestFormValues = z.infer<typeof attendanceTestFormSchema>;
