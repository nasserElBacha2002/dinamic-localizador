import { apiClient } from "./client";
import type { CreatePlatformCompanyInput, PlatformCompany, PlatformCompanyCreateResult } from "../types/platform-company";

export async function getPlatformCompanies(): Promise<PlatformCompany[]> {
  const { data } = await apiClient.get<{ data: PlatformCompany[] }>("platform/companies");
  return data.data;
}

export async function createPlatformCompany(input: CreatePlatformCompanyInput) {
  const { data } = await apiClient.post<PlatformCompanyCreateResult>("platform/companies", input);
  return data;
}
