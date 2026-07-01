import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee";
import { apiClient, buildParams } from "./client";
import { companyApiPath } from "./company-path";

export async function getEmployees(filters: EmployeeFilters = {}): Promise<PaginatedResponse<Employee>> {
  const { data } = await apiClient.get<PaginatedResponse<Employee>>(companyApiPath("/employees"), {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const { data } = await apiClient.get<SingleResponse<Employee>>(companyApiPath(`/employees/${id}`));
  return data.data;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const { data } = await apiClient.post<SingleResponse<Employee>>(companyApiPath("/employees"), input);
  return data.data;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const { data } = await apiClient.put<SingleResponse<Employee>>(companyApiPath(`/employees/${id}`), input);
  return data.data;
}

export async function deactivateEmployee(id: string): Promise<Employee> {
  const { data } = await apiClient.delete<SingleResponse<Employee>>(companyApiPath(`/employees/${id}`));
  return data.data;
}
