import { roleHasPermission } from "../constants/company-permissions";
import type { CompanyRole } from "../types/company";
import type { Employee } from "../types/domain";

/**
 * Approximate residence zone is personal data.
 * Only roles that can manage employees may see barrio/locality on Employee payloads.
 * Catalog admin also uses employees:manage | company:settings:update on zone routes.
 * Internal recommendation jobs (future) should read via repository, not this API projection.
 */
export const canViewEmployeeResidenceZone = (role: CompanyRole | undefined): boolean => {
  if (!role) {
    return false;
  }
  return roleHasPermission(role, "employees:manage");
};

export const redactEmployeeResidenceZone = (employee: Employee): Employee => ({
  ...employee,
  locationZoneId: null,
  locationZone: null,
});

export const projectEmployeeForRole = (
  employee: Employee,
  role: CompanyRole | undefined,
): Employee =>
  canViewEmployeeResidenceZone(role) ? employee : redactEmployeeResidenceZone(employee);
