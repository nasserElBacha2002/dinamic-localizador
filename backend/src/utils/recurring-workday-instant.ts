import { DateTime } from "luxon";
import { AppError } from "../errors/app-error";

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

const INVALID_LOCAL_MESSAGE =
  "El horario configurado no existe en la zona horaria para la fecha indicada.";
const AMBIGUOUS_LOCAL_MESSAGE =
  "El horario configurado es ambiguo en la zona horaria para la fecha indicada.";

const collectUtcMillisCandidatesForLocalDateTime = (
  workDate: string,
  time: string,
  timezone: string,
): Set<number> => {
  const [year, month, day] = workDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const dayStart = DateTime.fromObject({ year, month, day, hour: 0, minute: 0 }, { zone: timezone });
  const dayEnd = dayStart.plus({ days: 1 });

  const offsets = new Set<number>();
  for (let cursor = dayStart; cursor < dayEnd; cursor = cursor.plus({ minutes: 30 })) {
    offsets.add(cursor.offset);
  }

  const candidates = new Set<number>();
  for (const offsetMinutes of offsets) {
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const absolute = Math.abs(offsetMinutes);
    const offsetHours = String(Math.floor(absolute / 60)).padStart(2, "0");
    const offsetMins = String(absolute % 60).padStart(2, "0");
    const isoWithOffset = `${workDate}T${time}:00${sign}${offsetHours}:${offsetMins}`;
    const parsed = DateTime.fromISO(isoWithOffset, { setZone: true });
    if (!parsed.isValid) {
      continue;
    }

    const localized = parsed.setZone(timezone);
    if (
      localized.year === year &&
      localized.month === month &&
      localized.day === day &&
      localized.hour === hour &&
      localized.minute === minute
    ) {
      candidates.add(parsed.toUTC().toMillis());
    }
  }

  return candidates;
};

/** Converts local calendar date + HH:mm in IANA timezone to UTC instant (DST-safe). */
export const buildUtcInstantFromLocalWorkDateTime = (
  workDate: string,
  time: string,
  timezone: string,
): Date => {
  const candidates = collectUtcMillisCandidatesForLocalDateTime(workDate, time, timezone);

  if (candidates.size === 0) {
    throw new AppError(409, "INVALID_LOCAL_SCHEDULE_TIME", INVALID_LOCAL_MESSAGE);
  }

  if (candidates.size > 1) {
    throw new AppError(409, "AMBIGUOUS_LOCAL_SCHEDULE_TIME", AMBIGUOUS_LOCAL_MESSAGE);
  }

  return new Date([...candidates][0]!);
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
