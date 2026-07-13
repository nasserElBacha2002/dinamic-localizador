import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createService,
  deactivateService,
  getServiceById,
  getServices,
  updateService,
} from "../api/services.api";
import type { ServiceFilters, UpdateServiceInput } from "../types/service";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useServices(filters: ServiceFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["services", companyId, filters],
    queryFn: () => getServices(filters),
    enabled,
    retry: 1,
  });
}

export function useService(serviceId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(serviceId));

  return useQuery({
    queryKey: ["service", companyId, serviceId],
    queryFn: () => getServiceById(serviceId!),
    enabled,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}

export function useUpdateService(serviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateServiceInput) => updateService(serviceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      queryClient.invalidateQueries({ queryKey: ["service"] });
    },
  });
}

export function useDeactivateService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
    },
  });
}
