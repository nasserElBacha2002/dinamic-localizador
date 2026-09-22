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

export async function getAllClients(filters: Omit<ClientFilters, "page" | "limit"> = {}) {
  const limit = 100;
  const firstPage = await getClients({ ...filters, page: 1, limit });

  if (firstPage.meta.totalPages <= 1) {
    return firstPage;
  }

  const data = [...firstPage.data];
  for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
    const nextPage = await getClients({ ...filters, page, limit });
    data.push(...nextPage.data);
  }

  return {
    data,
    meta: {
      ...firstPage.meta,
      page: 1,
      limit: firstPage.meta.total,
    },
  };
}
