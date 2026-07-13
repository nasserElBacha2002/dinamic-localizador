/** ISO 8601 weekday: 1 = Monday .. 7 = Sunday */
export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

export type WeekdayNumber = (typeof WEEKDAY_NUMBERS)[number];

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS_ES: Record<Weekday, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

export const weekdayToNumber = (weekday: Weekday): WeekdayNumber =>
  (WEEKDAYS.indexOf(weekday) + 1) as WeekdayNumber;

export const numberToWeekday = (dayOfWeek: number): Weekday => {
  const index = dayOfWeek - 1;
  if (index < 0 || index >= WEEKDAYS.length) {
    throw new Error("INVALID_WEEKDAY_NUMBER");
  }
  return WEEKDAYS[index];
};

/** Maps JS Date#getDay() (0=Sunday) to ISO weekday number. */
export const jsDayToIsoWeekday = (jsDay: number): WeekdayNumber => {
  if (jsDay === 0) {
    return 7;
  }
  return jsDay as WeekdayNumber;
};

export const isoWeekdayFromDateIso = (workDate: string): WeekdayNumber => {
  const [year, month, day] = workDate.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDayToIsoWeekday(jsDay);
};
