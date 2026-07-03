import type {
  CompanyAbsenceSetting,
  UpdateCompanyAbsenceSettingsInput,
} from "../types/company-absence-settings";
import { scopedApiClient } from "./scoped-client";

export async function getCompanyAbsenceSettings(): Promise<CompanyAbsenceSetting[]> {
  const { data } = await scopedApiClient.get<{ data: CompanyAbsenceSetting[] }>(
    "settings/absences",
  );
  return data.data;
}

export async function updateCompanyAbsenceSettings(
  input: UpdateCompanyAbsenceSettingsInput,
): Promise<CompanyAbsenceSetting[]> {
  const { data } = await scopedApiClient.patch<{ data: CompanyAbsenceSetting[] }>(
    "settings/absences",
    input,
  );
  return data.data;
}
