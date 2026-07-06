import type {
  EmployeeLookup,
  OperationLookup,
  LookupQuery,
  ServiceLookup,
} from "../types/lookups";
import { API_ENDPOINTS } from "./endpoints";
import { scopedApiClient } from "./scoped-client";

export async function getEmployeeLookups(query: LookupQuery = {}): Promise<EmployeeLookup[]> {
  const { data } = await scopedApiClient.get<{ data: EmployeeLookup[] }>(
    API_ENDPOINTS.lookups.employees,
    {
      params: query,
    },
  );
  return data.data;
}

export async function getServiceLookups(query: LookupQuery = {}): Promise<ServiceLookup[]> {
  const { data } = await scopedApiClient.get<{ data: ServiceLookup[] }>(
    API_ENDPOINTS.lookups.services,
    {
      params: query,
    },
  );
  return data.data;
}

export async function getOperationLookups(query: LookupQuery = {}): Promise<OperationLookup[]> {
  const { data } = await scopedApiClient.get<{ data: OperationLookup[] }>(
    API_ENDPOINTS.lookups.operations,
    {
      params: query,
    },
  );
  return data.data;
}
