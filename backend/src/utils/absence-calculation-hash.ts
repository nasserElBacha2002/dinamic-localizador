import { createHash } from "node:crypto";
import type { AbsenceDayPeriod } from "../types/absence";
import type { AbsenceDayCountingMode } from "../constants/absence-calendar";

export const buildAbsenceCalculationInputHash = (input: {
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  startPeriod: AbsenceDayPeriod;
  endPeriod: AbsenceDayPeriod;
  countingMode: AbsenceDayCountingMode;
  calendarId: string;
  calendarVersion: number;
  timezone: string;
}): string => {
  const payload = [
    input.absenceTypeId,
    input.startDate,
    input.endDate,
    input.startPeriod,
    input.endPeriod,
    input.countingMode,
    input.calendarId,
    String(input.calendarVersion),
    input.timezone,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
};
