import { z } from "zod";

export const attendanceTestFormSchema = z.object({
  operationId: z.string().uuid("Seleccioná una operación"),
  employeeId: z.string().uuid("Seleccioná un empleado"),
  receivedLatitude: z.number().min(-90).max(90),
  receivedLongitude: z.number().min(-180).max(180),
  receivedAt: z.string().min(1, "La fecha es obligatoria"),
  sourceMessageSid: z.string().optional().or(z.literal("")),
});

export type AttendanceTestFormValues = z.infer<typeof attendanceTestFormSchema>;
