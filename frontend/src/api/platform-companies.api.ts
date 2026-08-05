import { apiClient } from "./client";
import type {
  CreatePlatformCompanyInput,
  PlatformCompany,
  PlatformCompanyCreateResult,
  PlatformCompanyLifecycle,
} from "../types/platform-company";

export async function getPlatformCompanies(): Promise<PlatformCompany[]> {
  const { data } = await apiClient.get<{ data: PlatformCompany[] }>("platform/companies");
  return data.data;
}

export async function createPlatformCompany(input: CreatePlatformCompanyInput) {
  const { data } = await apiClient.post<PlatformCompanyCreateResult>("platform/companies", input);
  return data;
}

export async function deactivatePlatformCompany(companyId: string, reason: string) {
  const { data } = await apiClient.post<{ data: PlatformCompanyLifecycle }>(
    `platform/companies/${companyId}/deactivate`,
    { reason },
  );
  return data.data;
}

export async function reactivatePlatformCompany(companyId: string) {
  const { data } = await apiClient.post<{ data: PlatformCompanyLifecycle }>(
    `platform/companies/${companyId}/reactivate`,
  );
  return data.data;
}

export async function getPlatformCompanyDeletionStatus(companyId: string) {
  const { data } = await apiClient.get<{ data: PlatformCompanyLifecycle }>(
    `platform/companies/${companyId}/deletion-status`,
  );
  return data.data;
}
