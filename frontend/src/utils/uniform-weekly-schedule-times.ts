import type { WeeklyScheduleDay } from "../types/schedule";

export type UniformWeeklyScheduleTimes = {
  startTime: string;
  endTime: string;
};

/**
 * Returns start/end when every enabled day shares the same pair.
 * Disabled days are ignored. Returns null when no enabled day, any enabled day
 * lacks complete hours, or enabled days differ.
 */
export function extractUniformWeeklyScheduleTimes(
  days: WeeklyScheduleDay[],
): UniformWeeklyScheduleTimes | null {
  const enabled = days.filter((day) => day.isEnabled);

  if (enabled.length === 0) {
    return null;
  }

  for (const day of enabled) {
    if (!day.startTime?.trim() || !day.endTime?.trim()) {
      return null;
    }
  }

  const first = enabled[0]!;
  const signature = `${first.startTime!.trim()}|${first.endTime!.trim()}`;

  for (const day of enabled) {
    if (`${day.startTime!.trim()}|${day.endTime!.trim()}` !== signature) {
      return null;
    }
  }

  return {
    startTime: first.startTime!.trim(),
    endTime: first.endTime!.trim(),
  };
}
