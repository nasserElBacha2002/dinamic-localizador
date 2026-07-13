import { z } from "zod";
import { WEEKDAYS } from "../constants/weekday";
import { SCHEDULE_SOURCES } from "../constants/schedule-source";

export const weeklyScheduleDaySchema = z.object({
  dayOfWeek: z.enum(WEEKDAYS),
  isEnabled: z.boolean(),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

export const weeklySchedulePayloadSchema = z.object({
  timezone: z.string().trim().min(1),
  days: z.array(weeklyScheduleDaySchema).length(7),
});

export const scheduleSourceSchema = z.enum(SCHEDULE_SOURCES);

export type WeeklyScheduleDayInput = z.infer<typeof weeklyScheduleDaySchema>;
export type WeeklySchedulePayloadInput = z.infer<typeof weeklySchedulePayloadSchema>;
