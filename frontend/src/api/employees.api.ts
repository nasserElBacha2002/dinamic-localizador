import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee";
import { apiClient, buildParams } from "./client";

export async function getEmployees(filters: EmployeeFilters = {}): Promise<PaginatedResponse<Employee>> {
  const { data } = await apiClient.get<PaginatedResponse<Employee>>("/employees", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const { data } = await apiClient.get<SingleResponse<Employee>>(`/employees/${id}`);
  return data.data;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const { data } = await apiClient.post<SingleResponse<Employee>>("/employees", input);
  return data.data;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const { data } = await apiClient.put<SingleResponse<Employee>>(`/employees/${id}`, input);
  return data.data;
}

export async function deactivateEmployee(id: string): Promise<Employee> {
  const { data } = await apiClient.delete<SingleResponse<Employee>>(`/employees/${id}`);
  return data.data;
}
