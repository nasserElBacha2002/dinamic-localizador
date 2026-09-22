import type { PaginatedResponse } from "../types/api";
import type { Client, ClientFilters } from "../types/client";
import type { CompanyLocationType, CreateCompanyLocationTypeInput, UpdateCompanyLocationTypeInput } from "../types/company-location-type";
import type { SingleResponse } from "../types/api";
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

export async function getClientById(id: string): Promise<Client> {
  const { data } = await scopedApiClient.get<SingleResponse<Client>>(`clients/${id}`);
  return data.data;
}
export async function createClient(input: { name: string }): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>("clients", input);
  return data.data;
}
export async function updateClient(id: string, input: { name: string }): Promise<Client> {
  const { data } = await scopedApiClient.patch<SingleResponse<Client>>(`clients/${id}`, input);
  return data.data;
}
export async function activateClient(id: string): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>(`clients/${id}/activate`);
  return data.data;
}
export async function deactivateClient(id: string): Promise<Client> {
  const { data } = await scopedApiClient.post<SingleResponse<Client>>(`clients/${id}/deactivate`);
  return data.data;
}
export async function getClientLocationTypes(clientId: string): Promise<CompanyLocationType[]> {
  const { data } = await scopedApiClient.get<SingleResponse<CompanyLocationType[]>>(`clients/${clientId}/location-types`);
  return data.data;
}
export async function createClientLocationType(clientId: string, input: CreateCompanyLocationTypeInput): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types`, input);
  return data.data;
}
export async function updateClientLocationType(clientId: string, id: string, input: UpdateCompanyLocationTypeInput): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.patch<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types/${id}`, input);
  return data.data;
}
export async function disableClientLocationType(clientId: string, id: string): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.delete<SingleResponse<CompanyLocationType>>(`clients/${clientId}/location-types/${id}`);
  return data.data;
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
