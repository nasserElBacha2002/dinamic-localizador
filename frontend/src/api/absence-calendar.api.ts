import { scopedApiClient } from "./scoped-client";
import type {
  AbsenceDurationPreview,
  CompanyCalendarDate,
  CompanyWorkCalendar,
} from "../types/absence-calendar";
import type { AbsenceDayPeriod } from "../types/absence";
import type { SingleResponse } from "../types/api";

type DataListResponse<T> = { data: T[] };

export async function listAbsenceCalendars(): Promise<CompanyWorkCalendar[]> {
  const { data } = await scopedApiClient.get<DataListResponse<CompanyWorkCalendar>>(
    "absence-calendars",
  );
  return data.data;
}

export async function getDefaultAbsenceCalendar(): Promise<CompanyWorkCalendar> {
  const { data } = await scopedApiClient.get<SingleResponse<CompanyWorkCalendar>>(
    "absence-calendars/default",
  );
  return data.data;
}

export async function updateAbsenceCalendar(
  calendarId: string,
  input: {
    name?: string;
    timezone?: string;
    isDefault?: boolean;
    isActive?: boolean;
    weekdays?: Array<{ dayOfWeek: number; isWorkingDay: boolean }>;
    expectedVersion: number;
  },
): Promise<CompanyWorkCalendar> {
  const { data } = await scopedApiClient.patch<SingleResponse<CompanyWorkCalendar>>(
    `absence-calendars/${calendarId}`,
    input,
  );
  return data.data;
}

export async function createAbsenceCalendar(input: {
  name: string;
  timezone: string;
  isDefault?: boolean;
  weekdays?: Array<{ dayOfWeek: number; isWorkingDay: boolean }>;
}): Promise<CompanyWorkCalendar> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyWorkCalendar>>(
    "absence-calendars",
    input,
  );
  return data.data;
}

export async function bootstrapDefaultAbsenceCalendar(): Promise<CompanyWorkCalendar> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyWorkCalendar>>(
    "absence-calendars/bootstrap-default",
  );
  return data.data;
}

export async function listAbsenceCalendarDates(
  calendarId: string,
  params?: { year?: number; includeInactive?: boolean },
): Promise<CompanyCalendarDate[]> {
  const { data } = await scopedApiClient.get<DataListResponse<CompanyCalendarDate>>(
    `absence-calendars/${calendarId}/dates`,
    { params },
  );
  return data.data;
}

export async function createAbsenceCalendarDate(input: {
  calendarId: string;
  date: string;
  name: string;
  dateType: string;
  isWorkingDay: boolean;
  notes?: string | null;
}): Promise<CompanyCalendarDate> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyCalendarDate>>(
    "absence-calendars/dates",
    input,
  );
  return data.data;
}

export async function updateAbsenceCalendarDate(
  dateId: string,
  input: {
    name?: string;
    dateType?: string;
    isWorkingDay?: boolean;
    notes?: string | null;
    isActive?: boolean;
    expectedVersion: number;
  },
): Promise<CompanyCalendarDate> {
  const { data } = await scopedApiClient.patch<SingleResponse<CompanyCalendarDate>>(
    `absence-calendars/dates/${dateId}`,
    input,
  );
  return data.data;
}

export async function calculateAbsenceDuration(input: {
  employeeId: string;
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod?: AbsenceDayPeriod;
  endPeriod?: AbsenceDayPeriod;
}): Promise<AbsenceDurationPreview> {
  const { data } = await scopedApiClient.post<SingleResponse<AbsenceDurationPreview>>(
    "absence-requests/calculate",
    input,
  );
  return data.data;
}
