import type {
  CompanyModule,
  UpdateCompanyModulesInput,
} from "../types/company-module";
import { scopedApiClient } from "./scoped-client";

export async function getCompanyModules(): Promise<CompanyModule[]> {
  const { data } = await scopedApiClient.get<{ data: CompanyModule[] }>("modules");
  return data.data;
}

export async function updateCompanyModules(
  input: UpdateCompanyModulesInput,
): Promise<CompanyModule[]> {
  const { data } = await scopedApiClient.patch<{ data: CompanyModule[] }>("modules", input);
  return data.data;
}
