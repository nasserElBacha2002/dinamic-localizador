import { z } from "zod";

export const absenceDayPeriodSchema = z.enum(["FULL_DAY", "AM", "PM"]);

export const absenceRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "NEEDS_INFO",
]);

export const absenceRequestedViaSchema = z.enum(["WHATSAPP", "ADMIN"]);

export const absenceRequestIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

const absenceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD");

export const createAbsenceRequestSchema = z
  .object({
    employeeId: z.string().uuid("UUID de empleado inválido"),
    absenceTypeId: z.string().uuid("UUID de tipo de ausencia inválido"),
    startDate: absenceDateSchema,
    endDate: absenceDateSchema,
    startPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
    endPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
    reason: z.string().trim().min(3, "El motivo es obligatorio").max(1000),
    requestedVia: absenceRequestedViaSchema.default("ADMIN"),
    sourceMessageSid: z.string().trim().max(100).nullable().optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "La fecha de inicio no puede ser posterior a la fecha de fin",
    path: ["endDate"],
  });

export const listAbsenceRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: absenceRequestStatusSchema.optional(),
  absenceTypeId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  dateFrom: absenceDateSchema.optional(),
  dateTo: absenceDateSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export const rejectAbsenceRequestSchema = z.object({
  reason: z.string().trim().min(3, "El motivo del rechazo es obligatorio").max(1000),
});

export const needsInfoAbsenceRequestSchema = z.object({
  comment: z.string().trim().min(3, "El comentario es obligatorio").max(1000),
});

export type CreateAbsenceRequestInput = z.infer<typeof createAbsenceRequestSchema>;
export type ListAbsenceRequestsQuery = z.infer<typeof listAbsenceRequestsQuerySchema>;
export type RejectAbsenceRequestInput = z.infer<typeof rejectAbsenceRequestSchema>;
export type NeedsInfoAbsenceRequestInput = z.infer<typeof needsInfoAbsenceRequestSchema>;
