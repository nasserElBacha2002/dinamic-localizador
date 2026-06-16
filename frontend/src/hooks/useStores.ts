import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStore,
  deactivateStore,
  getStoreById,
  getStores,
  updateStore,
} from "../api/stores.api";
import type { StoreFilters, UpdateStoreInput } from "../types/store";

export function useStores(filters: StoreFilters) {
  return useQuery({
    queryKey: ["stores", filters],
    queryFn: () => getStores(filters),
    retry: 1,
  });
}

export function useStore(storeId?: string) {
  return useQuery({
    queryKey: ["store", storeId],
    queryFn: () => getStoreById(storeId!),
    enabled: Boolean(storeId),
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
      queryClient.invalidateQueries({ queryKey: ["store", storeId] });
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
