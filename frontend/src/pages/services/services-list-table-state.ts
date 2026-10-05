import type { ServiceListSortField } from "../../types/service";
import { SERVICE_LIST_SORT_FIELDS } from "../../types/service";
import type { TableUrlFieldMap } from "../../utils/table-url-state";
import {
  isLocationTypeSelectableForServiceClient,
  type LocationTypeClientScope,
} from "../../utils/location-type-client-scope";

export const SERVICE_SORT_FIELDS = SERVICE_LIST_SORT_FIELDS;

export const SERVICE_TABLE_DEFAULTS = {
  page: 1,
  pageSize: 10,
  search: "",
  active: "all" as "all" | "true" | "false",
  serviceFormat: "",
  clientId: "",
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

export type ServiceFormatFilterLocationType = LocationTypeClientScope & { code: string };

/**
 * Clears a URL format filter once the catalog is loaded and the code is incompatible
 * with the selected client (including after async location type fetch).
 */
export function shouldClearServiceFormatFilter(
  serviceFormat: string,
  clientId: string,
  locationTypes: ServiceFormatFilterLocationType[] | undefined,
): boolean {
  if (!serviceFormat || locationTypes === undefined) {
    return false;
  }

  const assigned = locationTypes.find((type) => type.code === serviceFormat);
  if (!assigned) {
    return false;
  }

  return !isLocationTypeSelectableForServiceClient(assigned, clientId || null);
}

export function buildServicesListApiFilters(state: typeof SERVICE_TABLE_DEFAULTS) {
  return {
    page: state.page,
    limit: state.pageSize,
    search: state.search || undefined,
    active: state.active === "all" ? undefined : state.active === "true",
    serviceFormat: state.serviceFormat || undefined,
    ...(state.clientId ? { clientId: state.clientId } : {}),
    locality: state.locality || undefined,
    neighborhood:
      state.locality && state.neighborhood ? state.neighborhood : undefined,
    sortBy: state.sortBy,
    sortDirection: state.sortOrder,
  };
}