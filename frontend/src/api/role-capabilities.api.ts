import type { CompanyRole } from "../types/company-user";
import type { RoleCapabilities } from "../types/role-capabilities";
import { apiClient } from "./client";

export async function getRoleCapabilities(
  companyId: string,
  role: CompanyRole,
): Promise<RoleCapabilities> {
  const { data } = await apiClient.get<{ data: RoleCapabilities }>(
    `companies/${companyId}/roles/${encodeURIComponent(role)}/capabilities`,
  );
  return data.data;
}
