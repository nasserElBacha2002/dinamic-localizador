import { getUtcOffsetHoursFromTimezone } from "./absence-date";

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const addDaysToDateIso = (workDate: string, days: number): string => {
  const [year, month, day] = workDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
};

export const compareDateIso = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
};

/** Converts local calendar date + HH:mm in IANA timezone to UTC instant. */
export const buildUtcInstantFromLocalWorkDateTime = (
  workDate: string,
  time: string,
  timezone: string,
): Date => {
  const [year, month, day] = workDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const reference = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offsetHours = getUtcOffsetHoursFromTimezone(timezone, reference);
  return new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute, 0, 0));
};

export const isOvernightSchedule = (startTime: string, endTime: string): boolean =>
  endTime < startTime;

export const buildRecurringExpectedInstants = (input: {
  workDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
}): { expectedStartAt: Date; expectedEndAt: Date } => {
  const expectedStartAt = buildUtcInstantFromLocalWorkDateTime(
    input.workDate,
    input.startTime,
    input.timezone,
  );
  const endDate = isOvernightSchedule(input.startTime, input.endTime)
    ? addDaysToDateIso(input.workDate, 1)
    : input.workDate;
  const expectedEndAt = buildUtcInstantFromLocalWorkDateTime(
    endDate,
    input.endTime,
    input.timezone,
  );
  return { expectedStartAt, expectedEndAt };
};
