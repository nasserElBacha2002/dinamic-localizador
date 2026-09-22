import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activateClient, createClient, createClientLocationType, deactivateClient, disableClientLocationType, getAllClients, getClientById, getClientLocationTypes, updateClient, updateClientLocationType } from "../api/clients.api";
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

export function useClient(id?: string) { const { companyId, enabled } = useOperationalQueryEnabled(Boolean(id)); return useQuery({ queryKey: ["clients", companyId, id], queryFn: () => getClientById(id!), enabled }); }
const useClientMutation = <T,>(mutationFn: (input: T) => Promise<unknown>) => { const queryClient = useQueryClient(); const { companyId } = useOperationalQueryEnabled(); return useMutation({ mutationFn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["clients", companyId] }) }); };
export const useCreateClient = () => useClientMutation(createClient);
export const useUpdateClient = () => useClientMutation(({ id, name }: { id: string; name: string }) => updateClient(id, { name }));
export const useActivateClient = () => useClientMutation(activateClient);
export const useDeactivateClient = () => useClientMutation(deactivateClient);
export function useClientLocationTypes(clientId?: string) { const { companyId, enabled } = useOperationalQueryEnabled(Boolean(clientId)); return useQuery({ queryKey: ["client-location-types", companyId, clientId], queryFn: () => getClientLocationTypes(clientId!), enabled }); }
const useClientLocationTypeMutation = <T,>(clientId: string, mutationFn: (input: T) => Promise<unknown>) => { const queryClient = useQueryClient(); const { companyId } = useOperationalQueryEnabled(); return useMutation({ mutationFn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["client-location-types", companyId, clientId] }) }); };
export const useCreateClientLocationType = (clientId: string) => useClientLocationTypeMutation(clientId, (input: import("../types/company-location-type").CreateCompanyLocationTypeInput) => createClientLocationType(clientId, input));
export const useUpdateClientLocationType = (clientId: string) => useClientLocationTypeMutation(clientId, ({ id, input }: { id: string; input: import("../types/company-location-type").UpdateCompanyLocationTypeInput }) => updateClientLocationType(clientId, id, input));
export const useDisableClientLocationType = (clientId: string) => useClientLocationTypeMutation(clientId, (id: string) => disableClientLocationType(clientId, id));
