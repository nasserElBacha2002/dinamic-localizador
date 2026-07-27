import type {
  EmployeeLookup,
  OperationLookup,
  LookupQuery,
  ServiceLookup,
} from "../types/lookups";
import { API_ENDPOINTS } from "./endpoints";
import { scopedApiClient } from "./scoped-client";

export type LookupRequestOptions = {
  signal?: AbortSignal;
};

export async function getEmployeeLookups(
  query: LookupQuery = {},
  options?: LookupRequestOptions,
): Promise<EmployeeLookup[]> {
  const { data } = await scopedApiClient.get<{ data: EmployeeLookup[] }>(
    API_ENDPOINTS.lookups.employees,
    {
      params: query,
      signal: options?.signal,
    },
  );
  return data.data;
}

export async function getServiceLookups(
  query: LookupQuery = {},
  options?: LookupRequestOptions,
): Promise<ServiceLookup[]> {
  const { data } = await scopedApiClient.get<{ data: ServiceLookup[] }>(
    API_ENDPOINTS.lookups.services,
    {
      params: query,
      signal: options?.signal,
    },
  );
  return data.data;
}

export async function getOperationLookups(
  query: LookupQuery = {},
  options?: LookupRequestOptions,
): Promise<OperationLookup[]> {
  const { data } = await scopedApiClient.get<{ data: OperationLookup[] }>(
    API_ENDPOINTS.lookups.operations,
    {
      params: query,
      signal: options?.signal,
    },
  );
  return data.data;
}
