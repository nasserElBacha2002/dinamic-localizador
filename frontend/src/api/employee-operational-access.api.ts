import type { SingleResponse } from "../types/api";
import type { EmployeeOperationalAccessStatus } from "../types/employee-operational-access";
import { scopedApiClient } from "./scoped-client";

export async function getEmployeeOperationalAccess(
  employeeId: string,
): Promise<EmployeeOperationalAccessStatus> {
  const { data } = await scopedApiClient.get<SingleResponse<EmployeeOperationalAccessStatus>>(
    `employees/${employeeId}/operational-access`,
  );
  return data.data;
}

export async function linkEmployeeOperationalAccess(
  employeeId: string,
  userId: string,
): Promise<EmployeeOperationalAccessStatus> {
  const { data } = await scopedApiClient.post<SingleResponse<EmployeeOperationalAccessStatus>>(
    `employees/${employeeId}/operational-access/link`,
    { userId },
  );
  return data.data;
}

export async function inviteEmployeeOperationalAccess(
  employeeId: string,
  input: { email: string; inviteeName?: string | null },
): Promise<{ invitationId: string; email: string; emailSent: boolean }> {
  const { data } = await scopedApiClient.post<{
    data: { invitationId: string; email: string; emailSent: boolean };
    message: string;
  }>(`employees/${employeeId}/operational-access/invite`, input);
  return data.data;
}

export async function revokeEmployeeOperationalAccess(
  employeeId: string,
): Promise<EmployeeOperationalAccessStatus> {
  const { data } = await scopedApiClient.delete<SingleResponse<EmployeeOperationalAccessStatus>>(
    `employees/${employeeId}/operational-access`,
  );
  return data.data;
}
