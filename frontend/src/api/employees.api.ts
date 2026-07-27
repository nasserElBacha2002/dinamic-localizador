import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee";
import type {
  DeactivateEmployeeInput,
  EmployeeDeactivationImpact,
} from "../types/employee-deactivation";
import { buildParams } from "./client";
import type { ScopedAxiosRequestConfig } from "./scoped-client";
import { scopedApiClient } from "./scoped-client";

export type EmployeeRequestOptions = Pick<ScopedAxiosRequestConfig, "signal" | "scopeCompanyId">;

export async function getEmployees(
  filters: EmployeeFilters = {},
  options?: EmployeeRequestOptions,
): Promise<PaginatedResponse<Employee>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<Employee>>("employees", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    ...options,
  });
  return data;
}

export async function getEmployeeById(
  id: string,
  options?: EmployeeRequestOptions,
): Promise<Employee> {
  const { data } = await scopedApiClient.get<SingleResponse<Employee>>(`employees/${id}`, options);
  return data.data;
}

export async function getEmployeeDeactivationImpact(
  id: string,
  options?: EmployeeRequestOptions,
): Promise<EmployeeDeactivationImpact> {
  const { data } = await scopedApiClient.get<SingleResponse<EmployeeDeactivationImpact>>(
    `employees/${id}/deactivation-impact`,
    options,
  );
  return data.data;
}

export async function createEmployee(
  input: CreateEmployeeInput,
  options?: EmployeeRequestOptions,
): Promise<Employee> {
  const { data } = await scopedApiClient.post<SingleResponse<Employee>>(
    "employees",
    input,
    options,
  );
  return data.data;
}

export async function updateEmployee(
  id: string,
  input: UpdateEmployeeInput,
  options?: EmployeeRequestOptions,
): Promise<Employee> {
  const { data } = await scopedApiClient.put<SingleResponse<Employee>>(
    `employees/${id}`,
    input,
    options,
  );
  return data.data;
}

export async function deactivateEmployee(
  id: string,
  input: DeactivateEmployeeInput,
  options?: EmployeeRequestOptions,
): Promise<Employee> {
  const { data } = await scopedApiClient.post<SingleResponse<Employee>>(
    `employees/${id}/deactivate`,
    input,
    options,
  );
  return data.data;
}
