import type { ListLocationZonesFilters } from "../types/location-zone";

export const locationZoneKeys = {
  all: ["location-zones"] as const,
  lists: (companyId: string | undefined) =>
    [...locationZoneKeys.all, "list", companyId ?? "none"] as const,
  list: (companyId: string | undefined, filters: ListLocationZonesFilters) =>
    [...locationZoneKeys.lists(companyId), filters] as const,
  searches: (companyId: string | undefined) =>
    [...locationZoneKeys.all, "search", companyId ?? "none"] as const,
  search: (
    companyId: string | undefined,
    filters: { q: string; locality?: string; limit?: number },
  ) => [...locationZoneKeys.searches(companyId), filters] as const,
  geocodingSummary: (companyId: string | undefined) =>
    [...locationZoneKeys.all, "geocoding-summary", companyId ?? "none"] as const,
};
