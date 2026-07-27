import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createService,
  deactivateService,
  getServiceById,
  getServiceFacets,
  getServices,
  updateService,
} from "../api/services.api";
import type { Service, ServiceFilters, UpdateServiceInput } from "../types/service";
import { invalidateServiceScopedQueries } from "../queryKeys/invalidation";
import { serviceKeys } from "../queryKeys/services";
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
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: createService,
    onSuccess: () => {
      void invalidateServiceScopedQueries(queryClient, companyId);
    },
  });
}

export function useUpdateService(serviceId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: UpdateServiceInput) => updateService(serviceId, input),
    onSuccess: (updated: Service) => {
      queryClient.setQueryData(serviceKeys.detail(companyId, serviceId), updated);
      void invalidateServiceScopedQueries(queryClient, companyId);
    },
  });
}

export function useDeactivateService() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: deactivateService,
    onSuccess: (updated: Service) => {
      queryClient.setQueryData(serviceKeys.detail(companyId, updated.id), updated);
      void invalidateServiceScopedQueries(queryClient, companyId);
    },
  });
}
