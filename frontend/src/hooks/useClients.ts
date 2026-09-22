import { useQuery } from "@tanstack/react-query";
import { getClients } from "../api/clients.api";
import type { ClientFilters } from "../types/client";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const clientsQueryKey = (companyId?: string, filters: ClientFilters = {}) =>
  ["clients", companyId, filters] as const;

export function useClients(filters: ClientFilters = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: clientsQueryKey(companyId, filters),
    queryFn: () => getClients(filters),
    enabled,
    retry: 1,
  });
}
