import { z } from "zod";
import { OPERATION_KINDS } from "../constants/operation-kind";
import { SCHEDULE_SOURCES } from "../constants/schedule-source";
import { dateRangeSchema, paginationQuerySchema, searchFilterSchema, tableSortSchema } from "./common.schema";
import { weeklyScheduleDaySchema } from "./weekly-schedule.schema";

const operationStatusSchema = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

const hhMmSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horario inválido (HH:mm)");

const createOperationShiftSeedSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  templateId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
  startTime: hhMmSchema,
  endTime: hhMmSchema,
  days: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        isEnabled: z.boolean(),
      }),
    )
    .optional(),
});

const scheduleModeCreateFields = {
  scheduleMode: z.enum(["SINGLE", "MULTI_SHIFT"]).optional().default("SINGLE"),
  shifts: z.array(createOperationShiftSeedSchema).optional(),
};

const refineScheduleModeOnCreate = <
  T extends { scheduleMode: "SINGLE" | "MULTI_SHIFT"; shifts?: unknown[] },
>(
  data: T,
  ctx: z.RefinementCtx,
) => {
  if (data.scheduleMode === "MULTI_SHIFT") {
    if (!data.shifts || data.shifts.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Se requiere al menos un turno para crear en modo multi-turno",
        path: ["shifts"],
      });
    }
    return;
  }

  if (data.shifts && data.shifts.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "No enviés turnos cuando el modo es horario único",
      path: ["shifts"],
    });
  }
};

const operationBaseFields = {
  serviceId: z.string().uuid("UUID de servicio inválido"),
  earlyToleranceMinutes: z.number().int().min(0).nullable().optional(),
  lateToleranceMinutes: z.number().int().min(0).nullable().optional(),
};

export const createOneTimeOperationSchema = z
  .object({
    operationKind: z.literal("ONE_TIME"),
    ...operationBaseFields,
    ...scheduleModeCreateFields,
    scheduledStart: z.string().datetime({ offset: true }),
    scheduledEnd: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.scheduledEnd && !(new Date(data.scheduledEnd) > new Date(data.scheduledStart))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledEnd debe ser posterior a scheduledStart",
        path: ["scheduledEnd"],
      });
    }
    refineScheduleModeOnCreate(data, ctx);
  });

export const createRecurringOperationSchema = z
  .object({
    operationKind: z.literal("RECURRING"),
    ...operationBaseFields,
    ...scheduleModeCreateFields,
    validFrom: dateOnlySchema,
    validUntil: dateOnlySchema.nullable().optional(),
    scheduleSource: z.enum(SCHEDULE_SOURCES),
    scheduleDays: z.array(weeklyScheduleDaySchema).length(7).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.validUntil && data.validUntil < data.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de finalización no puede ser anterior a la fecha de inicio",
        path: ["validUntil"],
      });
    }

    if (data.scheduleSource === "CUSTOM" && !data.scheduleDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configurá al menos un día de trabajo para esta operación",
        path: ["scheduleDays"],
      });
    }

    if (data.scheduleSource === "COMPANY" && data.scheduleDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La configuración del horario no es válida",
        path: ["scheduleDays"],
      });
    }

    refineScheduleModeOnCreate(data, ctx);
  });

export const createOperationSchema = z.discriminatedUnion("operationKind", [
  createOneTimeOperationSchema,
  createRecurringOperationSchema,
]);

export const updateOperationSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    scheduledStart: z.string().datetime({ offset: true }).optional(),
    scheduledEnd: z.string().datetime({ offset: true }).nullable().optional(),
    earlyToleranceMinutes: z.number().int().min(0).nullable().optional(),
    lateToleranceMinutes: z.number().int().min(0).nullable().optional(),
    status: operationStatusSchema.optional(),
    operationKind: z.never().optional(),
    validFrom: dateOnlySchema.optional(),
    validUntil: dateOnlySchema.nullable().optional(),
    scheduleSource: z.enum(SCHEDULE_SOURCES).optional(),
    scheduleDays: z.array(weeklyScheduleDaySchema).length(7).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  })
  .refine((data) => data.operationKind === undefined, {
    message: "El tipo de operación no puede modificarse después de crearla",
    path: ["operationKind"],
  });

export const operationIdParamSchema = z.object({
  id: z.string().uuid("UUID inválido"),
});

export const operationAttendanceSummaryQuerySchema = paginationQuerySchema
  .merge(searchFilterSchema)
  .extend({
    workDate: dateOnlySchema.optional(),
    workdayId: z.string().uuid().optional(),
  });

export const listOperationsQuerySchema = paginationQuerySchema
  .merge(dateRangeSchema)
  .merge(searchFilterSchema)
  .merge(tableSortSchema)
  .extend({
    status: operationStatusSchema.optional(),
    serviceId: z.string().uuid().optional(),
    operationKind: z.enum(OPERATION_KINDS).optional(),
  });

export type CreateOperationInput = z.infer<typeof createOperationSchema>;
export type CreateOneTimeOperationInput = z.infer<typeof createOneTimeOperationSchema>;
export type CreateRecurringOperationInput = z.infer<typeof createRecurringOperationSchema>;
export type UpdateOperationInput = z.infer<typeof updateOperationSchema>;
export type ListOperationsQuery = z.infer<typeof listOperationsQuerySchema>;
