import type { PaginatedResponse } from "../types/api";
import type {
  CompanyMembershipContext,
  CompanyUser,
  CompanyUserFilters,
  CreateCompanyUserInput,
  UpdateCompanyUserInput,
} from "../types/company-user";
import { getActiveCompanyId } from "./company-path";
import { apiClient } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getCompanyMembership(
  companyId: string,
): Promise<CompanyMembershipContext> {
  const { data } = await apiClient.get<{ data: CompanyMembershipContext }>(
    `companies/${companyId}/me`,
  );
  return data.data;
}

export async function getCompanyUsers(filters: CompanyUserFilters = {}) {
  const { data } = await scopedApiClient.get<PaginatedResponse<CompanyUser>>("users", {
    params: filters,
  });
  return data;
}

export async function getCompanyUserById(userId: string) {
  const { data } = await scopedApiClient.get<{ data: CompanyUser }>(`users/${userId}`);
  return data.data;
}

export async function createCompanyUser(input: CreateCompanyUserInput) {
  const { data } = await scopedApiClient.post<{
    data: CompanyUser;
    message: string;
  }>("users", input);
  return data;
}

export async function updateCompanyUser(userId: string, input: UpdateCompanyUserInput) {
  const { data } = await scopedApiClient.patch<{ data: CompanyUser }>(`users/${userId}`, input);
  return data.data;
}

export async function deactivateCompanyUser(userId: string) {
  const { data } = await scopedApiClient.patch<{ data: CompanyUser }>(
    `users/${userId}/deactivate`,
  );
  return data.data;
}

export function getActiveCompanyMembershipPath(): string | null {
  const companyId = getActiveCompanyId();
  return companyId ? `companies/${companyId}/me` : null;
}
