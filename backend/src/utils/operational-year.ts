export function getCurrentYearInTimezone(timezone: string, referenceDate = new Date()): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
  });
  return Number(formatter.format(referenceDate));
}
