import type { DateRangeValue } from "../../../types/date-range";
import type { SystemLogsListFilters } from "../../../types/system-logs";
import type { TableUrlFieldMap } from "../../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../../utils/date-range-url";
import {
  EMPTY_DATE_RANGE_VALUE,
  getDateRangeQueryValue,
  resolveDateRangePreset,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../../utils/dates";

export const SYSTEM_LOGS_MAX_PAGE_SIZE = 50;

export const SYSTEM_LOGS_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 20,
  level: "",
  module: "",
  event: "",
  requestId: "",
  q: "",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const SYSTEM_LOGS_TABLE_FIELDS = {
  level: { type: "enum", values: ["", "error", "warn", "info"] },
} satisfies TableUrlFieldMap<typeof SYSTEM_LOGS_TABLE_DEFAULTS>;

export const shouldOmitSystemLogsTableValue = (
  key: keyof typeof SYSTEM_LOGS_TABLE_DEFAULTS,
  value: (typeof SYSTEM_LOGS_TABLE_DEFAULTS)[keyof typeof SYSTEM_LOGS_TABLE_DEFAULTS],
  defaults: typeof SYSTEM_LOGS_TABLE_DEFAULTS,
): boolean => {
  if (typeof value === "string") {
    return value === defaults[key] || value === "";
  }
  return value === defaults[key];
};

export type SystemLogsTableState = typeof SYSTEM_LOGS_TABLE_DEFAULTS;

function hydrateSystemLogsDateRange(value: DateRangeValue): DateRangeValue {
  if (value.preset && value.preset !== "custom" && (!value.from || !value.to)) {
    return resolveDateRangePreset(value.preset);
  }
  return value;
}

export function toSystemLogsActivityBounds(dateRange: DateRangeValue): {
  from?: string;
  to?: string;
} {
  const dateQuery = getDateRangeQueryValue(hydrateSystemLogsDateRange(dateRange));
  return {
    from: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    to: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
  };
}

export function buildSystemLogsListFilters(input: {
  state: SystemLogsTableState;
  dateRange: DateRangeValue;
  q?: string;
}): SystemLogsListFilters {
  const { state, dateRange } = input;
  const { from, to } = toSystemLogsActivityBounds(dateRange);
  const requestId = state.requestId.trim();
  const q = (input.q ?? state.q).trim();
  const limit = Math.min(Math.max(state.pageSize, 1), SYSTEM_LOGS_MAX_PAGE_SIZE);

  return {
    page: state.page,
    limit,
    level: state.level ? (state.level as SystemLogsListFilters["level"]) : undefined,
    module: state.module.trim() || undefined,
    event: state.event.trim() || undefined,
    requestId: requestId || undefined,
    q: q || undefined,
    from,
    to,
  };
}
