import type { DateRangeValue } from "../../../types/date-range";
import type {
  WhatsappConversationFilters,
  WhatsappConversationStatus,
} from "../../../types/whatsapp-observability";
import type { TableUrlFieldMap } from "../../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../../utils/date-range-url";
import {
  EMPTY_DATE_RANGE_VALUE,
  getDateRangeQueryValue,
  resolveDateRangePreset,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart } from "../../../utils/dates";

export const WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 20,
  employeeId: "",
  flowType: "",
  resultCode: "",
  status: "",
  hasError: "",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const WHATSAPP_OBSERVABILITY_TABLE_FIELDS = {
  employeeId: { type: "string" },
  hasError: { type: "enum", values: ["", "true", "false"] },
  status: { type: "enum", values: ["", "ACTIVE", "COMPLETED", "WARNING", "ERROR"] },
} satisfies TableUrlFieldMap<typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS>;

export const shouldOmitWhatsappObservabilityTableValue = (
  key: keyof typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
  value: (typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS)[keyof typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS],
  defaults: typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
): boolean => {
  if (typeof value === "string") {
    return value === defaults[key] || value === "";
  }
  return value === defaults[key];
};

export type WhatsappObservabilityTableState = typeof WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS;

/**
 * URL may store only `datePreset` (without from/to). Resolve calendar bounds so
 * activity filters hit the backend as ISO datetimes.
 */
export function hydrateObservabilityDateRange(value: DateRangeValue): DateRangeValue {
  if (value.preset && value.preset !== "custom" && (!value.from || !value.to)) {
    return resolveDateRangePreset(value.preset);
  }
  return value;
}

/** Convert date-range calendar days to ISO datetimes expected by observability Zod schemas. */
export function toObservabilityActivityBounds(dateRange: DateRangeValue): {
  from?: string;
  to?: string;
} {
  const dateQuery = getDateRangeQueryValue(hydrateObservabilityDateRange(dateRange));
  return {
    from: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    to: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
  };
}

/**
 * Maps URL table state (+ optional date range / debounced text) into API query filters.
 * Empty strings and "all" selects are omitted — never sent as blank query params.
 */
export function buildWhatsappConversationListFilters(input: {
  state: WhatsappObservabilityTableState;
  dateRange: DateRangeValue;
  flowType?: string;
  resultCode?: string;
}): WhatsappConversationFilters {
  const { state, dateRange } = input;
  const { from, to } = toObservabilityActivityBounds(dateRange);
  const flowType = (input.flowType ?? state.flowType).trim();
  const resultCode = (input.resultCode ?? state.resultCode).trim();

  const hasError =
    state.hasError === "true" ? true : state.hasError === "false" ? false : undefined;

  const status = state.status
    ? (state.status as WhatsappConversationStatus)
    : undefined;

  return {
    page: state.page,
    limit: state.pageSize,
    employeeId: state.employeeId.trim() || undefined,
    flowType: flowType || undefined,
    resultCode: resultCode || undefined,
    status,
    hasError,
    from,
    to,
  };
}
