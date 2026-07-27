import type { ScopedAxiosRequestConfig } from "./scoped-client";
import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateServiceInput,
  Service,
  ServiceFilters,
  ServiceGeoFacets,
  UpdateServiceInput,
} from "../types/service";
import { buildParams } from "./client";
import { API_ENDPOINTS, servicePath } from "./endpoints";
import { scopedApiClient } from "./scoped-client";

export type ServiceRequestOptions = Pick<ScopedAxiosRequestConfig, "signal" | "scopeCompanyId">;

export async function getServices(
  filters: ServiceFilters = {},
  options?: ServiceRequestOptions,
): Promise<PaginatedResponse<Service>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Service>>(API_ENDPOINTS.services, {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    ...options,
  });
  return data;
}

export async function getServiceFacets(options?: ServiceRequestOptions): Promise<ServiceGeoFacets> {
  const { data } = await scopedApiClient.get<SingleResponse<ServiceGeoFacets>>(
    API_ENDPOINTS.serviceFacets,
    options,
  );
  return data.data;
}

export async function getServiceById(
  id: string,
  options?: ServiceRequestOptions,
): Promise<Service> {
  const { data } = await scopedApiClient.get<SingleResponse<Service>>(servicePath(id), options);
  return data.data;
}

export async function createService(
  input: CreateServiceInput,
  options?: ServiceRequestOptions,
): Promise<Service> {
  const { data } = await scopedApiClient.post<SingleResponse<Service>>(
    API_ENDPOINTS.services,
    input,
    options,
  );
  return data.data;
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
  options?: ServiceRequestOptions,
): Promise<Service> {
  const { data } = await scopedApiClient.put<SingleResponse<Service>>(
    servicePath(id),
    input,
    options,
  );
  return data.data;
}

export async function deactivateService(
  id: string,
  options?: ServiceRequestOptions,
): Promise<Service> {
  const { data } = await scopedApiClient.delete<SingleResponse<Service>>(servicePath(id), options);
  return data.data;
}
