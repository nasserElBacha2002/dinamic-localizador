import { numberToWeekday, type WeekdayNumber } from "../constants/weekday";
import type { EffectiveRecurringSchedule, ResolvedScheduleDay } from "../types/schedule";

export const recurringScheduleResolver = {
  resolveDay(workDate: string, effectiveSchedule: EffectiveRecurringSchedule): ResolvedScheduleDay {
    const dayNumber = resolveIsoWeekdayFromDateIso(workDate);
    const weekday = numberToWeekday(dayNumber);
    const day = effectiveSchedule.days.find((item) => item.dayOfWeek === weekday);

    return {
      workDate,
      dayOfWeek: weekday,
      enabled: Boolean(day?.isEnabled),
      startTime: day?.isEnabled ? day.startTime : null,
      endTime: day?.isEnabled ? day.endTime : null,
      timezone: effectiveSchedule.timezone,
      scheduleSource: effectiveSchedule.scheduleSource,
      scheduleVersion: effectiveSchedule.version,
    };
  },
};

/** Local calendar date ISO (YYYY-MM-DD) to ISO weekday without timezone drift. */
export const resolveIsoWeekdayFromDateIso = (workDate: string): WeekdayNumber => {
  const [year, month, day] = workDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const jsDay = utc.getUTCDay();
  return (jsDay === 0 ? 7 : jsDay) as WeekdayNumber;
};
