import { useQuery } from "@tanstack/react-query";
import {
  getEmployeeLookups,
  getInventoryLookups,
  getStoreLookups,
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

export function useStoreLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["lookups", "stores", companyId, query],
    queryFn: () => getStoreLookups(query),
    enabled,
    staleTime: 30_000,
  });
}

export function useInventoryLookups(query: LookupQuery = {}, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: ["lookups", "inventories", companyId, query],
    queryFn: () => getInventoryLookups(query),
    enabled,
    staleTime: 30_000,
  });
}
