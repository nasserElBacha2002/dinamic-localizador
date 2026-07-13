const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnlyString(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

function parseDateOnlyParts(value: string): { year: number; month: number; day: number } {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) {
    throw new Error(`Formato de fecha calendario inválido: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
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
