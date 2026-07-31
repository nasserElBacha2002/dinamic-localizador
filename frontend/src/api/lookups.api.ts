import type {
  EmployeeLookup,
  OperationLookup,
  LookupQuery,
  ServiceLookup,
} from "../types/lookups";
import { API_ENDPOINTS } from "./endpoints";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export type LookupRequestOptions = {
  signal?: AbortSignal;
};

function toLookupParams(
  query: LookupQuery,
): Record<string, string | number | boolean | string[] | undefined> {
  return buildParams({
    search: query.search,
    limit: query.limit,
    id: query.id,
    ids: query.ids,
    active: query.active,
  });
}

export async function getEmployeeLookups(
  query: LookupQuery = {},
  options?: LookupRequestOptions,
): Promise<EmployeeLookup[]> {
  const { data } = await scopedApiClient.get<{ data: EmployeeLookup[] }>(
    API_ENDPOINTS.lookups.employees,
    {
      params: toLookupParams(query),
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
      params: toLookupParams(query),
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
      params: toLookupParams(query),
      signal: options?.signal,
    },
  );
  return data.data;
}
