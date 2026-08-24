import { env } from "../../config/env";
import { getDateIsoInTimezone } from "../absence-date";

/** Hour bucket for forwarded-location throttle (per employee/company/recipient). */
export const buildForwardedLocationDedupKey = (
  employeeId: string,
  at: Date = new Date(),
): string => {
  const timeZone = env.BOT_OPERATION_TIMEZONE;
  const dateIso = getDateIsoInTimezone(at, timeZone);
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(at);
  const bucket = `${dateIso.replace(/-/g, "")}${hour}`;
  return `forwarded:${employeeId}:${bucket}`;
};

export const buildUnavailableDedupKey = (
  assignmentId: string,
  scheduleVersion: number,
): string => `unavailable:${assignmentId}:${scheduleVersion}`;

export const buildMissingCheckinDedupKey = (employeeWorkdayId: string): string =>
  `missing-checkin:${employeeWorkdayId}`;
