import type { InventoryListSortField } from "../../types/inventory";
import type { TableUrlFieldMap } from "../../utils/table-url-state";
import type { DateRangeUrlFields } from "../../utils/date-range-url";
import { areDateRangeUrlFieldsEqual } from "../../utils/date-range-url";

export const INVENTORY_STATUS_VALUES = ["", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export const INVENTORY_SORT_FIELDS = [
  "storeName",
  "storeAddress",
  "scheduledStart",
  "scheduledEnd",
  "status",
  "earlyToleranceMinutes",
  "lateToleranceMinutes",
] as const satisfies readonly InventoryListSortField[];

export function buildInventoryTableDefaults(dateFields: DateRangeUrlFields) {
  return {
    page: 1,
    pageSize: 10,
    sortBy: "scheduledStart" as InventoryListSortField,
    sortOrder: "asc" as const,
    status: "",
    storeId: "",
    ...dateFields,
  };
}

export const INVENTORY_TABLE_FIELDS = {
  sortBy: { type: "enum", values: INVENTORY_SORT_FIELDS },
  sortOrder: { type: "enum", values: ["asc", "desc"] },
  status: { type: "enum", values: INVENTORY_STATUS_VALUES },
} satisfies TableUrlFieldMap<ReturnType<typeof buildInventoryTableDefaults>>;

export function shouldOmitInventoryTableValue(
  key: keyof ReturnType<typeof buildInventoryTableDefaults>,
  value: ReturnType<typeof buildInventoryTableDefaults>[keyof ReturnType<typeof buildInventoryTableDefaults>],
  defaults: ReturnType<typeof buildInventoryTableDefaults>,
  state: ReturnType<typeof buildInventoryTableDefaults>,
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
