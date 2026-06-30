import {
  formatAbsenceDateDisplay,
  parseSpanishDateInput,
} from "../../utils/absence-date";

export { formatAbsenceDateDisplay, parseSpanishDateInput };

const toCalendarIsoInTimezone = (date: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
};

export const parseBotDateDDMMYYYY = (value: string, _timezone: string): Date | null => {
  // Bot date inputs are calendar-only dates. We intentionally represent them
  // at noon UTC to avoid timezone day-shift issues when formatting or storing.
  // The timezone parameter is kept for API symmetry with formatting helpers.
  const parsed = parseSpanishDateInput(value);
  if (!parsed) {
    return null;
  }

  return new Date(`${parsed.iso}T12:00:00.000Z`);
};

export const formatBotDateDDMMYYYY = (date: Date, timezone: string): string =>
  formatAbsenceDateDisplay(toCalendarIsoInTimezone(date, timezone));
