export type DateRangeMode = "past" | "future" | "mixed";

export type DateRangePresetKey =
  | "today"
  | "yesterday"
  | "tomorrow"
  | "this_week"
  | "last_week"
  | "next_week"
  | "this_month"
  | "last_month"
  | "next_month"
  | "last_7_days"
  | "next_7_days"
  | "last_30_days"
  | "next_30_days"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePresetKey | null;
  from: string | null;
  to: string | null;
};
