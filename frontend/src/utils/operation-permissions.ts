import type { CompanyPermission } from "../types/permissions";
import { hasAnyPermission, hasPermission } from "./permissions";

const OPERATIONS_TEAM_MANAGE: CompanyPermission[] = [
  "operations:manage",
  "operations:teams:manage",
];

export function canManageOperationStructure(
  permissions: string[] | undefined,
): boolean {
  return hasPermission(permissions, "operations:manage");
}

export function canManageOperationTeams(
  permissions: string[] | undefined,
): boolean {
  return hasAnyPermission(permissions, OPERATIONS_TEAM_MANAGE);
}
