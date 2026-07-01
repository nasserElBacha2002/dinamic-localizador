import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStore,
  deactivateStore,
  getStoreById,
  getStores,
  updateStore,
} from "../api/stores.api";
import type { StoreFilters, UpdateStoreInput } from "../types/store";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useStores(filters: StoreFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["stores", companyId, filters],
    queryFn: () => getStores(filters, companyId),
    enabled,
    retry: 1,
  });
}

export function useStore(storeId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(storeId));

  return useQuery({
    queryKey: ["store", companyId, storeId],
    queryFn: () => getStoreById(storeId!, companyId),
    enabled,
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

export function useUpdateStore(storeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateStoreInput) => updateStore(storeId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["store"] });
    },
  });
}

export function useDeactivateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}
