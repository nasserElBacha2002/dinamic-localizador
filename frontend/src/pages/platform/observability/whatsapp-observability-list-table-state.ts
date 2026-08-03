import type { TableUrlFieldMap } from "../../../utils/table-url-state";
import { dateRangeToUrlFields } from "../../../utils/date-range-url";
import { EMPTY_DATE_RANGE_VALUE } from "../../../utils/date-range";

export const WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 20,
  search: "",
  phone: "",
  flowType: "",
  resultCode: "",
  status: "",
  hasError: "",
  ...dateRangeToUrlFields(EMPTY_DATE_RANGE_VALUE),
};

export const WHATSAPP_OBSERVABILITY_TABLE_FIELDS = {
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
