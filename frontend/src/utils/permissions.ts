import type { CompanyPermission } from "../types/permissions";

export function hasAnyPermission(
  permissions: string[] | undefined,
  required: readonly CompanyPermission[],
): boolean {
  if (!permissions || required.length === 0) {
    return false;
  }

  return required.some((permission) => permissions.includes(permission));
}

export function hasPermission(
  permissions: string[] | undefined,
  permission: CompanyPermission,
): boolean {
  return permissions?.includes(permission) ?? false;
}
