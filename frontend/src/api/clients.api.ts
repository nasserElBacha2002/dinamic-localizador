import type { PaginatedResponse } from "../types/api";
import type { Client, ClientFilters } from "../types/client";
import type { ClientLocationTypeFilters, CompanyLocationType, CreateCompanyLocationTypeInput, UpdateCompanyLocationTypeInput } from "../types/company-location-type";
import type { SingleResponse } from "../types/api";
import { buildParams } from "./client";
import { scopedApiClient, type ScopedAxiosRequestConfig } from "./scoped-client";

export type ClientRequestOptions = Pick<ScopedAxiosRequestConfig, "signal" | "scopeCompanyId">;

export async function getClients(
  filters: ClientFilters = {},
  options?: ClientRequestOptions,
): Promise<PaginatedResponse<Client>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Client>>("clients", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    ...options,
  });
  return data;
}

export async function getClientById(id: string, options?: ClientRequestOptions): Promise<Client> {
  const { data } = await scopedApiClient.get<SingleResponse<Client>>(`clients/${id}`, options);
  return data.data;
}
export async function createClient(input: { name: string }, options?: ClientRequestOptions): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>("clients", input, options);
  return data.data;
}
export async function updateClient(id: string, input: { name: string }, options?: ClientRequestOptions): Promise<Client> {
  const { data } = await scopedApiClient.patch<SingleResponse<Client>>(`clients/${id}`, input, options);
  return data.data;
}
export async function activateClient(id: string, options?: ClientRequestOptions): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>(`clients/${id}/activate`, undefined, options);
  return data.data;
}
export async function deactivateClient(id: string, options?: ClientRequestOptions): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>(`clients/${id}/deactivate`, undefined, options);
  return data.data;
}
export async function getClientLocationTypes(
  clientId: string,
  filters: ClientLocationTypeFilters = {},
  options?: ClientRequestOptions,
): Promise<PaginatedResponse<CompanyLocationType>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<CompanyLocationType>>(
    `clients/${clientId}/location-types`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
      ...options,
    },
  );
  return data;
}
export async function createClientLocationType(clientId: string, input: CreateCompanyLocationTypeInput, options?: ClientRequestOptions): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types`, input, options);
  return data.data;
}
export async function updateClientLocationType(clientId: string, id: string, input: UpdateCompanyLocationTypeInput, options?: ClientRequestOptions): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.patch<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types/${id}`, input, options);
  return data.data;
}
export async function disableClientLocationType(clientId: string, id: string, options?: ClientRequestOptions): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.delete<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types/${id}`, options);
  return data.data;
}

export async function getAllClients(
  filters: Omit<ClientFilters, "page" | "limit"> = {},
  options?: ClientRequestOptions,
) {
  const limit = 100;
  const firstPage = await getClients({ ...filters, page: 1, limit }, options);

  if (firstPage.meta.totalPages <= 1) {
    return firstPage;
  }

  const data = [...firstPage.data];
  for (let page = 2; page <= firstPage.meta.totalPages; page += 1) {
    const nextPage = await getClients({ ...filters, page, limit }, options);
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
