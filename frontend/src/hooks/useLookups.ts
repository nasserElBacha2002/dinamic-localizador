import { useQuery } from "@tanstack/react-query";
import {
  getEmployeeLookups,
  getOperationLookups,
  getServiceLookups,
} from "../api/lookups.api";
import type { LookupQuery } from "../types/lookups";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployeeLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["lookups", "employees", companyId, query],
    queryFn: () => getEmployeeLookups(query),
    enabled,
    staleTime: 30_000,
  });
}

export function useServiceLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["lookups", "services", companyId, query],
    queryFn: () => getServiceLookups(query),
    enabled,
    staleTime: 30_000,
  });
}

export function useOperationLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["lookups", "operations", companyId, query],
    queryFn: () => getOperationLookups(query),
    enabled,
    staleTime: 30_000,
  });
}
