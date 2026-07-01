import type {
  EmployeeLookup,
  InventoryLookup,
  LookupQuery,
  StoreLookup,
} from "../types/lookups";
import { scopedApiClient } from "./scoped-client";

export async function getEmployeeLookups(query: LookupQuery = {}): Promise<EmployeeLookup[]> {
  const { data } = await scopedApiClient.get<{ data: EmployeeLookup[] }>("lookups/employees", {
    params: query,
  });
  return data.data;
}

export async function getStoreLookups(query: LookupQuery = {}): Promise<StoreLookup[]> {
  const { data } = await scopedApiClient.get<{ data: StoreLookup[] }>("lookups/stores", {
    params: query,
  });
  return data.data;
}

export async function getInventoryLookups(query: LookupQuery = {}): Promise<InventoryLookup[]> {
  const { data } = await scopedApiClient.get<{ data: InventoryLookup[] }>("lookups/inventories", {
    params: query,
  });
  return data.data;
}
