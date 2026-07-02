import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getEmployees(filters: EmployeeFilters = {}): Promise<PaginatedResponse<Employee>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Employee>>("employees", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const { data } = await scopedApiClient.get<SingleResponse<Employee>>(`employees/${id}`);
  return data.data;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const { data } = await scopedApiClient.post<SingleResponse<Employee>>("employees", input);
  return data.data;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const { data } = await scopedApiClient.put<SingleResponse<Employee>>(`employees/${id}`, input);
  return data.data;
}

export async function deactivateEmployee(id: string): Promise<Employee> {
  const { data } = await scopedApiClient.delete<SingleResponse<Employee>>(`employees/${id}`);
  return data.data;
}
