import type { AbsenceDayCountingMode, AbsenceCalendarDateType } from "../constants/absence-calendar";
import type { WeekdayNumber } from "../constants/weekday";

export type CompanyWorkCalendar = {
  id: string;
  companyId: string;
  name: string;
  isDefault: boolean;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  weekdays: CompanyWorkCalendarWeekday[];
};

export type CompanyWorkCalendarWeekday = {
  id: string;
  companyId: string;
  calendarId: string;
  dayOfWeek: WeekdayNumber;
  isWorkingDay: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanyCalendarDate = {
  id: string;
  companyId: string;
  calendarId: string;
  date: string;
  name: string;
  dateType: AbsenceCalendarDateType;
  isWorkingDay: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AbsenceTypeCalendarFields = {
  dayCountingMode: AbsenceDayCountingMode;
  calendarId: string | null;
};

export type AbsenceCalculationSnapshot = {
  calculationMode: AbsenceDayCountingMode | null;
  calendarId: string | null;
  calendarTimezone: string | null;
  calculationVersion: number | null;
};
