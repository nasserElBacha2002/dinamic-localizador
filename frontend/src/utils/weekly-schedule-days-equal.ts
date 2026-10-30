import type { WeeklyScheduleDay } from "../types/schedule";

/** Compares weekly schedules by weekday, independent of array order. */
export function weeklyScheduleDaysEqual(
  left: WeeklyScheduleDay[],
  right: WeeklyScheduleDay[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightByDay = new Map(right.map((day) => [day.dayOfWeek, day]));

  return left.every((day) => {
    const other = rightByDay.get(day.dayOfWeek);
    if (!other) {
      return false;
    }

    return (
      day.isEnabled === other.isEnabled &&
      day.startTime === other.startTime &&
      day.endTime === other.endTime
    );
  });
}
