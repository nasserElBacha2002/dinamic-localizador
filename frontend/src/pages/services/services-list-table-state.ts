import type { ServiceListSortField } from "../../types/service";
import type { TableUrlFieldMap } from "../../utils/table-url-state";

export const SERVICE_SORT_FIELDS = [
  "name",
  "neighborhood",
  "locality",
  "serviceFormat",
  "address",
  "active",
  "createdAt",
] as const satisfies readonly ServiceListSortField[];

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
