import { useQuery } from "@tanstack/react-query";
import { getAllClients } from "../api/clients.api";
import type { ClientFilters } from "../types/client";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const clientsQueryKey = (companyId?: string, filters: ClientFilters = {}) =>
  ["clients", companyId, filters] as const;

export function useClients(filters: Omit<ClientFilters, "page" | "limit"> = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: clientsQueryKey(companyId, filters),
    queryFn: () => getAllClients(filters),
    enabled,
    retry: 1,
  });
}
