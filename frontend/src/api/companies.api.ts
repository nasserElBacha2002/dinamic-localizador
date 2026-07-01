import type { CompanyMembershipSummary } from "../types/company";
import { apiClient } from "./client";

export async function getCompanies(): Promise<CompanyMembershipSummary[]> {
  const { data } = await apiClient.get<{ data: CompanyMembershipSummary[] }>("companies");
  return data.data;
}
