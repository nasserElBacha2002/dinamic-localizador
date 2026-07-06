export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS_ES: Record<Weekday, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export type ScheduleSource = "COMPANY" | "CUSTOM";

export interface WeeklyScheduleDay {
  dayOfWeek: Weekday;
  isEnabled: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface CompanyWorkSchedule {
  id: string;
  companyId: string;
  timezone: string;
  version: number;
  days: WeeklyScheduleDay[];
  createdAt: string;
  updatedAt: string;
}

export interface OperationScheduleView {
  scheduleSource: ScheduleSource;
  validFrom: string;
  validUntil: string | null;
  timezone: string;
  version: number;
  days: WeeklyScheduleDay[];
}

export interface OperationScheduleSummary {
  scheduleSource: ScheduleSource;
  validFrom: string;
  validUntil: string | null;
  summaryLabel: string;
  enabledWeekdayCount: number;
  hasCustomWeekdayHours: boolean;
}

export const createDefaultWeeklySchedule = (
  startTime = "09:00",
  endTime = "18:00",
): WeeklyScheduleDay[] =>
  WEEKDAYS.map((dayOfWeek) => ({
    dayOfWeek,
    isEnabled: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY",
    startTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? startTime : null,
    endTime: dayOfWeek !== "SATURDAY" && dayOfWeek !== "SUNDAY" ? endTime : null,
  }));

export const isOvernightSchedule = (startTime: string, endTime: string): boolean =>
  endTime <= startTime;
