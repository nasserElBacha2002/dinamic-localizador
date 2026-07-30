import { z } from "zod";
import {
  ABSENCE_CALENDAR_DATE_TYPES,
  ABSENCE_DAY_COUNTING_MODES,
} from "../constants/absence-calendar";
import { isValidOperationTimezone } from "../constants/company-settings";
import { WEEKDAY_NUMBERS } from "../constants/weekday";
import { absenceDayPeriodSchema } from "./absence-request.schema";

const absenceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato YYYY-MM-DD");

const weekdayRuleSchema = z.object({
  dayOfWeek: z.coerce
    .number()
    .int()
    .refine((value) => (WEEKDAY_NUMBERS as readonly number[]).includes(value), {
      message: "Día de semana inválido (1-7)",
    }),
  isWorkingDay: z.boolean(),
});

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((value) => isValidOperationTimezone(value), {
    message: "La zona horaria no es una zona IANA válida",
  });

export const absenceCalendarIdParamSchema = z.object({
  calendarId: z.string().uuid("UUID de calendario inválido"),
});

export const absenceCalendarDateIdParamSchema = z.object({
  dateId: z.string().uuid("UUID de fecha inválido"),
});

export const listCalendarDatesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  includeInactive: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((value) => value === true || value === "true"),
});

export const createAbsenceCalendarSchema = z.object({
  name: z.string().trim().min(1).max(120),
  timezone: timezoneSchema,
  isDefault: z.boolean().optional().default(false),
  weekdays: z.array(weekdayRuleSchema).length(7).optional(),
});

export const updateAbsenceCalendarSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  timezone: timezoneSchema.optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  weekdays: z.array(weekdayRuleSchema).length(7).optional(),
  expectedVersion: z.coerce.number().int().min(1),
});

export const createCalendarDateSchema = z.object({
  calendarId: z.string().uuid(),
  date: absenceDateSchema,
  name: z.string().trim().min(1).max(200),
  dateType: z.enum(ABSENCE_CALENDAR_DATE_TYPES),
  isWorkingDay: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateCalendarDateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  dateType: z.enum(ABSENCE_CALENDAR_DATE_TYPES).optional(),
  isWorkingDay: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  expectedVersion: z.coerce.number().int().min(1),
});

export const calculateAbsenceDurationSchema = z
  .object({
    employeeId: z.string().uuid("UUID de empleado inválido"),
    absenceTypeId: z.string().uuid("UUID de tipo de ausencia inválido"),
    startDate: absenceDateSchema,
    endDate: absenceDateSchema,
    startPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
    endPeriod: absenceDayPeriodSchema.default("FULL_DAY"),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: "La fecha de inicio no puede ser posterior a la fecha de fin",
    path: ["endDate"],
  });

export const absenceDayCountingModeSchema = z.enum(ABSENCE_DAY_COUNTING_MODES);

export type CreateAbsenceCalendarInput = z.infer<typeof createAbsenceCalendarSchema>;
export type UpdateAbsenceCalendarInput = z.infer<typeof updateAbsenceCalendarSchema>;
export type CreateCalendarDateInput = z.infer<typeof createCalendarDateSchema>;
export type UpdateCalendarDateInput = z.infer<typeof updateCalendarDateSchema>;
export type CalculateAbsenceDurationInput = z.infer<typeof calculateAbsenceDurationSchema>;
