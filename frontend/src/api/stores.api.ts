import type { PaginatedResponse, SingleResponse } from "../types/api";
import type { CreateStoreInput, Store, StoreFilters, UpdateStoreInput } from "../types/store";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getStores(filters: StoreFilters = {}): Promise<PaginatedResponse<Store>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Store>>("stores", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getStoreById(id: string): Promise<Store> {
  const { data } = await scopedApiClient.get<SingleResponse<Store>>(`stores/${id}`);
  return data.data;
}

export async function createStore(input: CreateStoreInput): Promise<Store> {
  const { data } = await scopedApiClient.post<SingleResponse<Store>>("stores", input);
  return data.data;
}

export async function updateStore(id: string, input: UpdateStoreInput): Promise<Store> {
  const { data } = await scopedApiClient.put<SingleResponse<Store>>(`stores/${id}`, input);
  return data.data;
}

export async function deactivateStore(id: string): Promise<Store> {
  const { data } = await scopedApiClient.delete<SingleResponse<Store>>(`stores/${id}`);
  return data.data;
}
