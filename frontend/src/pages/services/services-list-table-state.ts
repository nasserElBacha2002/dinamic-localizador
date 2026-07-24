import type { ServiceListSortField } from "../../types/service";
import { SERVICE_LIST_SORT_FIELDS } from "../../types/service";
import type { TableUrlFieldMap } from "../../utils/table-url-state";

export const SERVICE_SORT_FIELDS = SERVICE_LIST_SORT_FIELDS;

export const SERVICE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
  serviceFormat: "",
  locality: "",
  neighborhood: "",
  sortBy: "createdAt" as ServiceListSortField,
  sortOrder: "desc" as const,
};

export const SERVICE_TABLE_FIELDS = {
  active: { type: "enum", values: ["all", "true", "false"] },
  sortBy: { type: "enum", values: SERVICE_SORT_FIELDS },
  sortOrder: { type: "enum", values: ["asc", "desc"] },
} satisfies TableUrlFieldMap<typeof SERVICE_TABLE_DEFAULTS>;

export function shouldOmitServiceTableValue(
  key: keyof typeof SERVICE_TABLE_DEFAULTS,
  value: (typeof SERVICE_TABLE_DEFAULTS)[keyof typeof SERVICE_TABLE_DEFAULTS],
  defaults: typeof SERVICE_TABLE_DEFAULTS,
): boolean {
  return value === defaults[key] || value === "";
}

/** Columns marked sortable in the services table must belong to the sort contract. */
export const SERVICE_TABLE_SORTABLE_COLUMN_KEYS = [
  "name",
  "neighborhood",
  "locality",
  "serviceFormat",
  "address",
  "active",
] as const satisfies readonly ServiceListSortField[];

export function buildServicesListApiFilters(state: typeof SERVICE_TABLE_DEFAULTS) {
  return {
    page: state.page,
    limit: state.pageSize,
    search: state.search || undefined,
    active: state.active === "all" ? undefined : state.active === "true",
    serviceFormat: state.serviceFormat || undefined,
    locality: state.locality || undefined,
    neighborhood:
      state.locality && state.neighborhood ? state.neighborhood : undefined,
    sortBy: state.sortBy,
    sortDirection: state.sortOrder,
  };
}