import type { CompanySettings, UpdateCompanySettingsInput } from "../types/company-settings";
import { scopedApiClient } from "./scoped-client";

export async function getCompanySettings(): Promise<CompanySettings> {
  const { data } = await scopedApiClient.get<{ data: CompanySettings }>("settings");
  return data.data;
}

export async function updateCompanySettings(
  input: UpdateCompanySettingsInput,
): Promise<CompanySettings> {
  const { data } = await scopedApiClient.patch<{ data: CompanySettings }>("settings", input);
  return data.data;
}
