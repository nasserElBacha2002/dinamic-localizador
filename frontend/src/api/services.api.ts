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

export async function getServices(filters: ServiceFilters = {}): Promise<PaginatedResponse<Service>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Service>>(API_ENDPOINTS.services, {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getServiceFacets(): Promise<ServiceGeoFacets> {
  const { data } = await scopedApiClient.get<SingleResponse<ServiceGeoFacets>>(
    API_ENDPOINTS.serviceFacets,
  );
  return data.data;
}

export async function getServiceById(id: string): Promise<Service> {
  const { data } = await scopedApiClient.get<SingleResponse<Service>>(servicePath(id));
  return data.data;
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const { data } = await scopedApiClient.post<SingleResponse<Service>>(API_ENDPOINTS.services, input);
  return data.data;
}

export async function updateService(id: string, input: UpdateServiceInput): Promise<Service> {
  const { data } = await scopedApiClient.put<SingleResponse<Service>>(servicePath(id), input);
  return data.data;
}

export async function deactivateService(id: string): Promise<Service> {
  const { data } = await scopedApiClient.delete<SingleResponse<Service>>(servicePath(id));
  return data.data;
}
