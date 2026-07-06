import type { ScheduleSource } from "../constants/schedule-source";
import type { Weekday } from "../constants/weekday";

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

export interface OperationSchedule {
  id: string;
  companyId: string;
  operationId: string;
  scheduleSource: ScheduleSource;
  /** Authoritative only for CUSTOM. Null for COMPANY (company schedule owns timezone). */
  timezone: string | null;
  validFrom: string;
  validUntil: string | null;
  version: number;
  days: WeeklyScheduleDay[];
  createdAt: string;
  updatedAt: string;
}

/** Unified effective weekly schedule for a recurring operation at resolution time. */
export interface EffectiveRecurringSchedule {
  scheduleSource: ScheduleSource;
  timezone: string;
  version: number;
  days: WeeklyScheduleDay[];
}

export interface ResolvedScheduleDay {
  workDate: string;
  dayOfWeek: Weekday;
  enabled: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  scheduleSource: ScheduleSource;
  scheduleVersion: number;
}

export interface OperationScheduleSummary {
  scheduleSource: ScheduleSource;
  validFrom: string;
  validUntil: string | null;
  summaryLabel: string;
  enabledWeekdayCount: number;
  hasCustomWeekdayHours: boolean;
}
