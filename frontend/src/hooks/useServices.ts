import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createService,
  deactivateService,
  getServiceById,
  getServiceFacets,
  getServices,
  updateService,
} from "../api/services.api";
import type {
  CreateServiceInput,
  ServiceFilters,
  UpdateServiceInput,
} from "../types/service";
import { invalidateServiceListAndLookupQueries } from "../queryKeys/invalidation";
import { serviceKeys } from "../queryKeys/services";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useServices(filters: ServiceFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: serviceKeys.list(companyId, filters),
    queryFn: () => getServices(filters),
    enabled,
  });
}

export function useServiceFacets() {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: serviceKeys.facets(companyId),
    queryFn: () => getServiceFacets(),
    enabled,
    staleTime: 60_000,
  });
}

export function useService(serviceId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(serviceId));

  return useQuery({
    queryKey: serviceKeys.detail(companyId, serviceId),
    queryFn: () => getServiceById(serviceId!),
    enabled,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: CreateServiceInput;
    }) => createService(input, { scopeCompanyId: companyId }),
    onSuccess: async (_created, variables) => {
      await invalidateServiceListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (
      input: CreateServiceInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: CreateServiceInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useUpdateService(serviceId: string) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({ companyId, input }: { companyId: string; input: UpdateServiceInput }) =>
      updateService(serviceId, input, { scopeCompanyId: companyId }),
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData(serviceKeys.detail(variables.companyId, serviceId), updated);
      await invalidateServiceListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (input: UpdateServiceInput, options?: Parameters<typeof mutation.mutate>[1]) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: UpdateServiceInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useDeactivateService() {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({ companyId, serviceId }: { companyId: string; serviceId: string }) =>
      deactivateService(serviceId, { scopeCompanyId: companyId }),
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData(serviceKeys.detail(variables.companyId, updated.id), updated);
      await invalidateServiceListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (serviceId: string, options?: Parameters<typeof mutation.mutate>[1]) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), serviceId }, options);
    },
    mutateAsync: (serviceId: string, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), serviceId }, options),
  };
}
