const TIMEZONE = "America/Argentina/Buenos_Aires";

const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  return dateTimeFormatter.format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "—";
  }

  return dateFormatter.format(new Date(iso));
}

export function isoToDatetimeLocal(iso: string): string {
  const parts = dateTimeFormatter.formatToParts(new Date(iso));
  const year = getPart(parts, "year");
  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const hour = getPart(parts, "hour");
  const minute = getPart(parts, "minute");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function datetimeLocalToIso(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  let guess = Date.UTC(year, month - 1, day, hour, minute);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = dateTimeFormatter.formatToParts(new Date(guess));
    const tzYear = Number(getPart(parts, "year"));
    const tzMonth = Number(getPart(parts, "month"));
    const tzDay = Number(getPart(parts, "day"));
    const tzHour = Number(getPart(parts, "hour"));
    const tzMinute = Number(getPart(parts, "minute"));

    if (tzYear === year && tzMonth === month && tzDay === day && tzHour === hour && tzMinute === minute) {
      return new Date(guess).toISOString();
    }

    const desiredMinutes = hour * 60 + minute;
    const actualMinutes = tzHour * 60 + tzMinute;
    const dayDiff = day - tzDay;
    guess -= (dayDiff * 24 * 60 + (actualMinutes - desiredMinutes)) * 60 * 1000;
  }

  return new Date(guess).toISOString();
}

export function dateInputToIsoStart(dateValue: string): string {
  return datetimeLocalToIso(`${dateValue}T00:00`);
}

export function dateInputToIsoEnd(dateValue: string): string {
  return datetimeLocalToIso(`${dateValue}T23:59`);
}
