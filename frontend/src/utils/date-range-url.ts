import type { DateRangePresetKey, DateRangeValue } from "../types/date-range";

export interface DateRangeUrlFields {
  datePreset: string;
  dateFrom: string;
  dateTo: string;
}

export function dateRangeToUrlFields(range: DateRangeValue): DateRangeUrlFields {
  return {
    datePreset: range.preset ?? "",
    dateFrom: range.from ?? "",
    dateTo: range.to ?? "",
  };
}

export function urlFieldsToDateRange(fields: DateRangeUrlFields): DateRangeValue {
  return {
    preset: (fields.datePreset as DateRangePresetKey) || null,
    from: fields.dateFrom || null,
    to: fields.dateTo || null,
  };
}

export function areDateRangeUrlFieldsEqual(
  left: DateRangeUrlFields,
  right: DateRangeUrlFields,
): boolean {
  return (
    left.datePreset === right.datePreset &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo
  );
}
