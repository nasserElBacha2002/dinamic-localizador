import type { PaginatedResponse } from "../types/api";
import type { Client, ClientFilters } from "../types/client";
import { buildParams } from "./client";
import { scopedApiClient, type ScopedAxiosRequestConfig } from "./scoped-client";

export async function getClients(
  filters: ClientFilters = {},
  options?: Pick<ScopedAxiosRequestConfig, "signal" | "scopeCompanyId">,
): Promise<PaginatedResponse<Client>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Client>>("clients", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    ...options,
  });
  return data;
}
