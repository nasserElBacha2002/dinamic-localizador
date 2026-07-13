import type {
  CompanyLocationType,
  CreateCompanyLocationTypeInput,
  UpdateCompanyLocationTypeInput,
} from "../types/company-location-type";
import { scopedApiClient } from "./scoped-client";

export async function listCompanyLocationTypes(
  activeOnly = false,
): Promise<CompanyLocationType[]> {
  const query = activeOnly ? "?activeOnly=true" : "";
  const { data } = await scopedApiClient.get<{ data: CompanyLocationType[] }>(
    `settings/location-types${query}`,
  );
  return data.data;
}

export async function createCompanyLocationType(
  input: CreateCompanyLocationTypeInput,
): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.post<{ data: CompanyLocationType }>(
    "settings/location-types",
    input,
  );
  return data.data;
}

export async function updateCompanyLocationType(
  locationTypeId: string,
  input: UpdateCompanyLocationTypeInput,
): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.patch<{ data: CompanyLocationType }>(
    `settings/location-types/${locationTypeId}`,
    input,
  );
  return data.data;
}

export async function disableCompanyLocationType(
  locationTypeId: string,
): Promise<CompanyLocationType> {
  const { data } = await scopedApiClient.delete<{ data: CompanyLocationType }>(
    `settings/location-types/${locationTypeId}`,
  );
  return data.data;
}
