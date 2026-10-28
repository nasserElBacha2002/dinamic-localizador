/**
 * Split absence day quantities by calendar year using start/end date range.
 *
 * @deprecated Prefer allocationsByYearFromBreakdown / resolveYearAllocations.
 * This proportional calendar-day split is an approximate LEGACY fallback only.
 */
export const splitAbsenceQuantityByYear = (input: {
  startDate: string;
  endDate: string;
  totalDays: number;
}): Array<{ year: number; quantity: number }> => {
  const total = Number(input.totalDays);
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }

  const startYear = Number.parseInt(input.startDate.slice(0, 4), 10);
  const endYear = Number.parseInt(input.endDate.slice(0, 4), 10);
  if (startYear === endYear) {
    return [{ year: startYear, quantity: total }];
  }

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  const end = new Date(`${input.endDate}T00:00:00.000Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const calendarDaysByYear = new Map<number, number>();

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += dayMs) {
    const year = new Date(cursor).getUTCFullYear();
    calendarDaysByYear.set(year, (calendarDaysByYear.get(year) ?? 0) + 1);
  }

  const totalCalendarDays = [...calendarDaysByYear.values()].reduce((sum, days) => sum + days, 0);
  if (totalCalendarDays <= 0) {
    return [{ year: startYear, quantity: total }];
  }

  const years = [...calendarDaysByYear.keys()].sort((a, b) => a - b);
  const allocations: Array<{ year: number; quantity: number }> = [];
  let remaining = total;

  years.forEach((year, index) => {
    const days = calendarDaysByYear.get(year) ?? 0;
    if (index === years.length - 1) {
      allocations.push({ year, quantity: Number(remaining.toFixed(1)) });
      return;
    }
    const share = Number(((total * days) / totalCalendarDays).toFixed(1));
    allocations.push({ year, quantity: share });
    remaining = Number((remaining - share).toFixed(1));
  });

  return allocations.filter((row) => row.quantity > 0);
};
