import type {
  EmployeeLookup,
  InventoryLookup,
  LookupQuery,
  StoreLookup,
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

export async function getStoreLookups(query: LookupQuery = {}): Promise<StoreLookup[]> {
  const { data } = await scopedApiClient.get<{ data: StoreLookup[] }>(
    API_ENDPOINTS.lookups.locations,
    {
      params: query,
    },
  );
  return data.data;
}

export async function getInventoryLookups(query: LookupQuery = {}): Promise<InventoryLookup[]> {
  const { data } = await scopedApiClient.get<{ data: InventoryLookup[] }>(
    API_ENDPOINTS.lookups.operations,
    {
      params: query,
    },
  );
  return data.data;
}
