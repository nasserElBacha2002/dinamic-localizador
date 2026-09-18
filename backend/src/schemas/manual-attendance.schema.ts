import { z } from "zod";

export const manualAttendanceKindSchema = z.enum(["CHECK_IN", "CHECK_OUT"]);

export const manualAttendancePreviewSchema = z.object({
  kind: manualAttendanceKindSchema,
  operationId: z.string().uuid("UUID de operación inválido"),
  employeeId: z.string().uuid("UUID de empleado inválido").optional(),
  attendanceId: z.string().uuid("UUID de asistencia inválido").optional(),
  occurredAt: z.string().datetime({ offset: true }),
});

export const manualAttendanceMutationSchema = z.object({
  kind: manualAttendanceKindSchema,
  operationId: z.string().uuid("UUID de operación inválido").optional(),
  employeeId: z.string().uuid("UUID de empleado inválido").optional(),
  attendanceId: z.string().uuid("UUID de asistencia inválido").optional(),
  occurredAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(500),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export type ManualAttendancePreviewInput = z.infer<typeof manualAttendancePreviewSchema>;
export type ManualAttendanceMutationInput = z.infer<typeof manualAttendanceMutationSchema>;
