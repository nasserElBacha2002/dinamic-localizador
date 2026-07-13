const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

/**
 * Confirms a calendar date is real. JavaScript's Date normalizes impossible
 * values (e.g. 2026-02-31 → 2026-03-03), so we must compare the reconstructed
 * UTC parts against the requested ones to reject invalid dates.
 */
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() === month - 1 &&
    utcDate.getUTCDate() === day
  );
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Formato de fecha calendario inválido: ${value}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (!isRealCalendarDate(year, month, day)) {
    throw new Error(`Fecha calendario inválida: ${value}`);
  }

  return { year, month, day };
}

export function formatDateOnly(value: string, locale = "es-AR"): string {
  const { year, month, day } = parseDateOnlyParts(value);

  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateOnlyWithWeekday(value: string, locale = "es-AR"): string {
  const { year, month, day } = parseDateOnlyParts(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formatted = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
}
