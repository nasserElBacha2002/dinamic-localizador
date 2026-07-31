import { hasPermission } from "../../utils/permissions";
import type { CompanyPermission } from "../../types/permissions";

export function canReviewAbsences(
  permissions: ReadonlyArray<string | CompanyPermission> | undefined,
): boolean {
  return hasPermission(permissions as CompanyPermission[] | undefined, "absences:review");
}

export function canShowAbsenceReviewActions(
  permissions: ReadonlyArray<string | CompanyPermission> | undefined,
  status: string,
): boolean {
  return canReviewAbsences(permissions) && (status === "PENDING" || status === "NEEDS_INFO");
}

export function canAdminEditNeedsInfo(
  permissions: ReadonlyArray<string | CompanyPermission> | undefined,
  status: string,
): boolean {
  return canReviewAbsences(permissions) && status === "NEEDS_INFO";
}
