import { z } from "zod";

export const manualAttendanceKindSchema = z.enum(["CHECK_IN", "CHECK_OUT"]);

export const manualAttendancePreviewSchema = z
  .object({
    kind: manualAttendanceKindSchema,
    operationId: z.string().uuid("UUID de operación inválido"),
    employeeId: z.string().uuid("UUID de empleado inválido").optional(),
    employeeWorkdayId: z.string().uuid("UUID de jornada inválido").optional(),
    attendanceId: z.string().uuid("UUID de asistencia inválido").optional(),
    occurredAt: z.string().datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    if (!value.attendanceId && !value.employeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe indicar employeeId o attendanceId.",
        path: ["employeeId"],
      });
    }
    if (!value.attendanceId && !value.employeeWorkdayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe indicar employeeWorkdayId para previsualizar un alta.",
        path: ["employeeWorkdayId"],
      });
    }
  });

export const manualAttendanceCreateSchema = z.object({
  kind: manualAttendanceKindSchema,
  operationId: z.string().uuid("UUID de operación inválido"),
  employeeId: z.string().uuid("UUID de empleado inválido"),
  employeeWorkdayId: z.string().uuid("UUID de jornada inválido"),
  occurredAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(500),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export const manualAttendanceEditSchema = z.object({
  kind: manualAttendanceKindSchema,
  occurredAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1, "El motivo es obligatorio").max(500),
  comment: z.string().trim().max(1000).nullable().optional(),
  /** Optimistic concurrency: prior effective timestamp the client last observed. */
  expectedOccurredAt: z.string().datetime({ offset: true }),
});

export type ManualAttendancePreviewInput = z.infer<typeof manualAttendancePreviewSchema>;
export type ManualAttendanceCreateInput = z.infer<typeof manualAttendanceCreateSchema>;
export type ManualAttendanceEditInput = z.infer<typeof manualAttendanceEditSchema>;
