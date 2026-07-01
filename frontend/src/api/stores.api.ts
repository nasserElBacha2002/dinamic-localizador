import type { PaginatedResponse, SingleResponse } from "../types/api";
import type { CreateStoreInput, Store, StoreFilters, UpdateStoreInput } from "../types/store";
import { apiClient, buildParams } from "./client";
import { companyApiPath } from "./company-path";

export async function getStores(
  filters: StoreFilters = {},
  companyId?: string,
): Promise<PaginatedResponse<Store>> {
  const { data } = await apiClient.get<PaginatedResponse<Store>>(companyApiPath("stores", companyId), {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getStoreById(id: string, companyId?: string): Promise<Store> {
  const { data } = await apiClient.get<SingleResponse<Store>>(companyApiPath(`stores/${id}`, companyId));
  return data.data;
}

export async function createStore(input: CreateStoreInput): Promise<Store> {
  const { data } = await apiClient.post<SingleResponse<Store>>(companyApiPath("stores"), input);
  return data.data;
}

export async function updateStore(id: string, input: UpdateStoreInput): Promise<Store> {
  const { data } = await apiClient.put<SingleResponse<Store>>(companyApiPath(`stores/${id}`), input);
  return data.data;
}

export async function deactivateStore(id: string): Promise<Store> {
  const { data } = await apiClient.delete<SingleResponse<Store>>(companyApiPath(`stores/${id}`));
  return data.data;
}
