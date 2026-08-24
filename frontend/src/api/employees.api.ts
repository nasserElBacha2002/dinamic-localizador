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

export type EmployeeOperationalAvailability = {
  currentStatus: string;
  timezone: string;
  intervalStartAt: string;
  intervalEndAt: string;
  coveringAbsenceIds: string[];
  nextApprovedAbsence: {
    id: string;
    startDate: string;
    endDate: string;
    startPeriod: string;
    endPeriod: string;
    status: string;
  } | null;
  pendingRequests: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    startPeriod: string;
    endPeriod: string;
  }>;
  affectedOperationIds: string[];
  openConflicts: Array<{
    id: string;
    absenceRequestId: string;
    conflictType: string;
    operationId: string | null;
    assignmentId: string | null;
    status: string;
  }>;
  relatedReplacements: Array<{
    conflictId: string;
    absenceRequestId: string;
    operationId: string | null;
    assignmentId: string | null;
    status: string;
    replacementEmployeeId: string | null;
  }>;
};

export async function getEmployeeOperationalAvailability(
  id: string,
  options?: EmployeeRequestOptions,
): Promise<EmployeeOperationalAvailability> {
  const { data } = await scopedApiClient.get<SingleResponse<EmployeeOperationalAvailability>>(
    `employees/${id}/operational-availability`,
    options,
  );
  return data.data;
}

export type EmployeeAssignedOperation = {
  assignmentId: string;
  operationId: string;
  operationKind: string;
  operationWorkdayId: string;
  employeeWorkdayId: string | null;
  serviceName: string;
  serviceAddress: string | null;
  serviceLocality: string | null;
  serviceLatitude: number | null;
  serviceLongitude: number | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  operationStatus: string;
  confirmationStatus: string;
  attendanceReceivedAt: string | null;
  attendanceCheckoutAt: string | null;
  punctualityStatus: string | null;
};

export type EmployeeOperationsFilters = {
  page?: number;
  limit?: number;
  segment?: "active" | "past";
  dateFrom?: string;
  dateTo?: string;
};

export async function getEmployeeOperations(
  id: string,
  filters: EmployeeOperationsFilters = {},
  options?: EmployeeRequestOptions,
): Promise<PaginatedResponse<EmployeeAssignedOperation>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<EmployeeAssignedOperation>>(
    `employees/${id}/operations`,
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
      ...options,
    },
  );
  return data;
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
