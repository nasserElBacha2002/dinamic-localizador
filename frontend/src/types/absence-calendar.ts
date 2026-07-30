export type AbsenceDayCountingMode = "CALENDAR_DAYS" | "BUSINESS_DAYS";

export type AbsenceCalendarDateType =
  | "HOLIDAY"
  | "NON_WORKING_DAY"
  | "WORKING_DAY_OVERRIDE"
  | "COMPANY_EVENT";

export type CompanyWorkCalendarWeekday = {
  id: string;
  companyId: string;
  calendarId: string;
  dayOfWeek: number;
  isWorkingDay: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanyWorkCalendar = {
  id: string;
  companyId: string;
  name: string;
  isDefault: boolean;
  timezone: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  weekdays: CompanyWorkCalendarWeekday[];
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
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AbsenceDurationPreview = {
  totalDays: number;
  countingMode: AbsenceDayCountingMode;
  calendarDays: number;
  workingDays: number;
  nonWorkingDays: number;
  holidayDays: number;
  partialDays: number;
  timezone: string;
  calendarId: string;
  calculationVersion: number;
  excludedSummary: string[];
  warnings: string[];
};
