import { useQuery } from "@tanstack/react-query";
import {
  getEmployeeLookups,
  getOperationLookups,
  getServiceLookups,
} from "../api/lookups.api";
import type { LookupQuery } from "../types/lookups";
import { LOOKUP_STALE_TIME_MS, lookupKeys, normalizeLookupSearchParams } from "../queryKeys/lookups";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployeeLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  const normalized = normalizeLookupSearchParams({
    search: query.search,
    activeOnly: query.active,
    limit: query.limit,
  });

  return useQuery({
    queryKey: lookupKeys.employeeSearch(companyId, {
      search: normalized.search,
      activeOnly: normalized.activeOnly,
      limit: normalized.limit,
    }),
    queryFn: ({ signal }) =>
      getEmployeeLookups(
        {
          search: normalized.search || undefined,
          limit: normalized.limit,
          active: normalized.activeOnly ? true : undefined,
          id: query.id,
        },
        { signal },
      ),
    enabled,
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

export function useServiceLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  const normalized = normalizeLookupSearchParams({
    search: query.search,
    activeOnly: query.active,
    limit: query.limit,
  });

  return useQuery({
    queryKey: lookupKeys.serviceSearch(companyId, {
      search: normalized.search,
      activeOnly: normalized.activeOnly,
      limit: normalized.limit,
    }),
    queryFn: ({ signal }) =>
      getServiceLookups(
        {
          search: normalized.search || undefined,
          limit: normalized.limit,
          active: normalized.activeOnly ? true : undefined,
          id: query.id,
        },
        { signal },
      ),
    enabled,
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}

export function useOperationLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);
  const normalized = normalizeLookupSearchParams({
    search: query.search,
    activeOnly: query.active,
    limit: query.limit,
  });

  return useQuery({
    queryKey: lookupKeys.operationSearch(companyId, {
      search: normalized.search,
      activeOnly: normalized.activeOnly,
      limit: normalized.limit,
    }),
    queryFn: ({ signal }) =>
      getOperationLookups(
        {
          search: normalized.search || undefined,
          limit: normalized.limit,
          active: normalized.activeOnly ? true : undefined,
          id: query.id,
        },
        { signal },
      ),
    enabled,
    staleTime: LOOKUP_STALE_TIME_MS,
  });
}
