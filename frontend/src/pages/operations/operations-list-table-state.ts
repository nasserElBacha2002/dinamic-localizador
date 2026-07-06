import type { OperationListSortField } from "../../types/operation";
import type { TableUrlFieldMap } from "../../utils/table-url-state";
import type { DateRangeUrlFields } from "../../utils/date-range-url";
import { areDateRangeUrlFieldsEqual } from "../../utils/date-range-url";

export const INVENTORY_STATUS_VALUES = ["", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export const INVENTORY_SORT_FIELDS = [
  "serviceName",
  "serviceAddress",
  "scheduledStart",
  "scheduledEnd",
  "status",
  "earlyToleranceMinutes",
  "lateToleranceMinutes",
] as const satisfies readonly OperationListSortField[];

export function buildOperationTableDefaults(dateFields: DateRangeUrlFields) {
  return {
    page: 1,
    pageSize: 10,
    sortBy: "scheduledStart" as OperationListSortField,
    sortOrder: "asc" as const,
    status: "",
    serviceId: "",
    ...dateFields,
  };
}

export const INVENTORY_TABLE_FIELDS = {
  sortBy: { type: "enum", values: INVENTORY_SORT_FIELDS },
  sortOrder: { type: "enum", values: ["asc", "desc"] },
  status: { type: "enum", values: INVENTORY_STATUS_VALUES },
} satisfies TableUrlFieldMap<ReturnType<typeof buildOperationTableDefaults>>;

export function shouldOmitOperationTableValue(
  key: keyof ReturnType<typeof buildOperationTableDefaults>,
  value: ReturnType<typeof buildOperationTableDefaults>[keyof ReturnType<typeof buildOperationTableDefaults>],
  defaults: ReturnType<typeof buildOperationTableDefaults>,
  state: ReturnType<typeof buildOperationTableDefaults>,
  defaultDateFields: DateRangeUrlFields,
): boolean {
  if (key === "datePreset" || key === "dateFrom" || key === "dateTo") {
    return areDateRangeUrlFieldsEqual(
      {
        datePreset: String(state.datePreset),
        dateFrom: String(state.dateFrom),
        dateTo: String(state.dateTo),
      },
      defaultDateFields,
    );
  }

  return value === defaults[key] || value === "";
}
