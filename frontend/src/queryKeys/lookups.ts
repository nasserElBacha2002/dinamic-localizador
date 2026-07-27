/**
 * Lookup / autocomplete query keys (company-scoped).
 * Service and employee selectors share these keys so equivalent searches reuse cache.
 */

export interface NormalizedLookupSearchParams {
  search: string;
  activeOnly: boolean;
  limit: number;
}

export function normalizeLookupSearchParams(params: {
  search?: string;
  activeOnly?: boolean;
  limit?: number;
}): NormalizedLookupSearchParams {
  return {
    search: params.search?.trim() ?? "",
    activeOnly: params.activeOnly ?? true,
    limit: params.limit ?? 10,
  };
}

export const lookupKeys = {
  all: ["lookups"] as const,

  services: () => [...lookupKeys.all, "services"] as const,
  serviceCompany: (companyId: string | undefined) =>
    [...lookupKeys.services(), companyId] as const,
  serviceSearches: (companyId: string | undefined) =>
    [...lookupKeys.serviceCompany(companyId), "search"] as const,
  serviceSearch: (
    companyId: string | undefined,
    params: { search?: string; activeOnly?: boolean; limit?: number },
  ) =>
    [...lookupKeys.serviceSearches(companyId), normalizeLookupSearchParams(params)] as const,
  serviceSelected: (companyId: string | undefined, serviceId: string | undefined) =>
    [...lookupKeys.serviceCompany(companyId), "selected", serviceId] as const,

  employees: () => [...lookupKeys.all, "employees"] as const,
  employeeCompany: (companyId: string | undefined) =>
    [...lookupKeys.employees(), companyId] as const,
  employeeSearches: (companyId: string | undefined) =>
    [...lookupKeys.employeeCompany(companyId), "search"] as const,
  employeeSearch: (
    companyId: string | undefined,
    params: { search?: string; activeOnly?: boolean; limit?: number },
  ) =>
    [...lookupKeys.employeeSearches(companyId), normalizeLookupSearchParams(params)] as const,
  employeeSelected: (companyId: string | undefined, employeeId: string | undefined) =>
    [...lookupKeys.employeeCompany(companyId), "selected", employeeId] as const,

  operations: () => [...lookupKeys.all, "operations"] as const,
  operationCompany: (companyId: string | undefined) =>
    [...lookupKeys.operations(), companyId] as const,
  operationSearches: (companyId: string | undefined) =>
    [...lookupKeys.operationCompany(companyId), "search"] as const,
  operationSearch: (
    companyId: string | undefined,
    params: { search?: string; activeOnly?: boolean; limit?: number },
  ) =>
    [...lookupKeys.operationSearches(companyId), normalizeLookupSearchParams(params)] as const,
  operationSelected: (companyId: string | undefined, operationId: string | undefined) =>
    [...lookupKeys.operationCompany(companyId), "selected", operationId] as const,
};

/** Catalog / autocomplete freshness — invalidate immediately after mutations. */
export const LOOKUP_STALE_TIME_MS = 30_000;
