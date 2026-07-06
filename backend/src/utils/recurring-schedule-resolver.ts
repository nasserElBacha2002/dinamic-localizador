import { numberToWeekday, type WeekdayNumber } from "../constants/weekday";
import type { ResolvedScheduleDay, WeeklyScheduleDay } from "../types/schedule";
import type { ScheduleSource } from "../constants/schedule-source";

export const recurringScheduleResolver = {
  resolveDay(
    workDate: string,
    input: {
      timezone: string;
      scheduleSource: ScheduleSource;
      scheduleVersion: number;
      days: WeeklyScheduleDay[];
    },
  ): ResolvedScheduleDay {
    const dayNumber = resolveIsoWeekdayFromDateIso(workDate);
    const weekday = numberToWeekday(dayNumber);
    const day = input.days.find((item) => item.dayOfWeek === weekday);

    return {
      workDate,
      dayOfWeek: weekday,
      enabled: Boolean(day?.isEnabled),
      startTime: day?.isEnabled ? day.startTime : null,
      endTime: day?.isEnabled ? day.endTime : null,
      timezone: input.timezone,
      scheduleSource: input.scheduleSource,
      scheduleVersion: input.scheduleVersion,
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
