import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  activateClient,
  createClient,
  createClientLocationType,
  deactivateClient,
  disableClientLocationType,
  getAllClients,
  getClientById,
  getClientLocationTypes,
  getClients,
  updateClient,
  updateClientLocationType,
} from "../api/clients.api";
import type {
  ClientLocationTypeFilters,
  CreateCompanyLocationTypeInput,
  UpdateCompanyLocationTypeInput,
} from "../types/company-location-type";
import type { ClientFilters } from "../types/client";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const clientsQueryKey = (companyId?: string, filters: ClientFilters = {}) =>
  ["clients", companyId, filters] as const;

const clientLocationTypesQueryKey = (companyId: string | undefined, clientId: string | undefined) =>
  ["client-location-types", companyId, clientId] as const;

export function useClients(filters: Omit<ClientFilters, "page" | "limit"> = {}) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: clientsQueryKey(companyId, filters),
    queryFn: () => getAllClients(filters, { scopeCompanyId: requireCompanyId(companyId) }),
    enabled,
    retry: 1,
  });
}

export function useClientsList(filters: ClientFilters) {
  const { companyId, enabled, isCompanyLoading } = useOperationalQueryEnabled();
  const query = useQuery({
    queryKey: clientsQueryKey(companyId, filters),
    queryFn: () => getClients(filters, { scopeCompanyId: requireCompanyId(companyId) }),
    enabled,
    retry: 1,
  });

  return { ...query, isCompanyLoading };
}

export function useClient(id?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(id));
  return useQuery({
    queryKey: ["clients", companyId, id],
    queryFn: () => getClientById(id!, { scopeCompanyId: requireCompanyId(companyId) }),
    enabled,
  });
}

function useClientMutation<TVariables, TResult>(
  mutationFn: (companyId: string, variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();
  const mutation = useMutation({
    mutationFn: ({ companyId, variables }: { companyId: string; variables: TVariables }) =>
      mutationFn(companyId, variables),
    onSuccess: async (_result, { companyId }) => {
      await queryClient.invalidateQueries({ queryKey: ["clients", companyId] });
    },
  });

  return {
    ...mutation,
    mutate: (variables: TVariables, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), variables }, options),
    mutateAsync: (variables: TVariables, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), variables }, options),
  };
}

export const useCreateClient = () =>
  useClientMutation((companyId, input: { name: string }) =>
    createClient(input, { scopeCompanyId: companyId }),
  );
export const useUpdateClient = () =>
  useClientMutation((companyId, input: { id: string; name: string }) =>
    updateClient(input.id, { name: input.name }, { scopeCompanyId: companyId }),
  );
export const useActivateClient = () =>
  useClientMutation((companyId, id: string) => activateClient(id, { scopeCompanyId: companyId }));
export const useDeactivateClient = () =>
  useClientMutation((companyId, id: string) => deactivateClient(id, { scopeCompanyId: companyId }));

export function useClientLocationTypes(
  clientId?: string,
  filters: ClientLocationTypeFilters = {},
) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(clientId));
  return useQuery({
    queryKey: [...clientLocationTypesQueryKey(companyId, clientId), filters],
    queryFn: () =>
      getClientLocationTypes(clientId!, filters, { scopeCompanyId: requireCompanyId(companyId) }),
    enabled,
  });
}

function useClientLocationTypeMutation<TVariables, TResult>(
  clientId: string,
  mutationFn: (companyId: string, variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();
  const mutation = useMutation({
    mutationFn: ({ companyId, variables }: { companyId: string; variables: TVariables }) =>
      mutationFn(companyId, variables),
    onSuccess: async (_result, { companyId }) => {
      await queryClient.invalidateQueries({
        queryKey: clientLocationTypesQueryKey(companyId, clientId),
      });
    },
  });

  return {
    ...mutation,
    mutate: (variables: TVariables, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), variables }, options),
    mutateAsync: (variables: TVariables, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), variables }, options),
  };
}

export const useCreateClientLocationType = (clientId: string) =>
  useClientLocationTypeMutation(clientId, (companyId, input: CreateCompanyLocationTypeInput) =>
    createClientLocationType(clientId, input, { scopeCompanyId: companyId }),
  );
export const useUpdateClientLocationType = (clientId: string) =>
  useClientLocationTypeMutation(
    clientId,
    (companyId, input: { id: string; input: UpdateCompanyLocationTypeInput }) =>
      updateClientLocationType(clientId, input.id, input.input, { scopeCompanyId: companyId }),
  );
export const useDisableClientLocationType = (clientId: string) =>
  useClientLocationTypeMutation(clientId, (companyId, id: string) =>
    disableClientLocationType(clientId, id, { scopeCompanyId: companyId }),
  );
