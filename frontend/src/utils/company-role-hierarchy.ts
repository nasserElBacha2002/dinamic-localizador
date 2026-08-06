import type { CompanyRole } from "../types/company-user";

/** Keep in sync with backend/src/types/company.ts COMPANY_ROLES order. */
export const COMPANY_ROLES: readonly CompanyRole[] = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
] as const;

/** Keep in sync with backend/src/constants/company-role-hierarchy.ts */
export const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  HR: 60,
  SUPERVISOR: 40,
  OPERATOR: 20,
  READ_ONLY: 10,
};

export const USER_SELF_EDIT_BLOCKED_MESSAGE =
  "No podés editar tu propio usuario. La modificación debe ser realizada por otro usuario autorizado.";

export const USER_EDIT_HIERARCHY_BLOCKED_MESSAGE =
  "No podés editar este usuario. La modificación debe ser realizada por un usuario con un rango superior.";

export const getCompanyRoleRank = (role: CompanyRole): number => COMPANY_ROLE_RANK[role];

export const isStrictlySuperiorRole = (
  actorRole: CompanyRole,
  targetRole: CompanyRole,
): boolean => getCompanyRoleRank(actorRole) > getCompanyRoleRank(targetRole);

/** Membership update: strictly below actor rank (platform admin: any). */
export const canAssignCompanyRole = (
  actorRole: CompanyRole | undefined,
  roleToAssign: CompanyRole,
  actorIsPlatformAdmin: boolean,
): boolean => {
  if (actorIsPlatformAdmin) {
    return true;
  }
  if (!actorRole) {
    return false;
  }
  return getCompanyRoleRank(actorRole) > getCompanyRoleRank(roleToAssign);
};

/** Invitation: OWNER may invite OWNER; others strictly inferior. */
export const canAssignRoleOnInvitation = (
  actorRole: CompanyRole | undefined,
  roleToAssign: CompanyRole,
  actorIsPlatformAdmin: boolean,
): boolean => {
  if (actorIsPlatformAdmin) {
    return true;
  }
  if (!actorRole) {
    return false;
  }
  if (actorRole === "OWNER") {
    return true;
  }
  return getCompanyRoleRank(actorRole) > getCompanyRoleRank(roleToAssign);
};

export type CompanyUserEditBlockReason = "self" | "hierarchy";

export const getCompanyUserEditBlockReason = (input: {
  actorUserId: string | undefined;
  actorRole: CompanyRole | undefined;
  actorIsPlatformAdmin: boolean;
  targetUserId: string;
  targetRole: CompanyRole;
}): CompanyUserEditBlockReason | null => {
  if (input.actorUserId && input.actorUserId === input.targetUserId) {
    return "self";
  }
  if (input.actorIsPlatformAdmin) {
    return null;
  }
  if (!input.actorRole || !isStrictlySuperiorRole(input.actorRole, input.targetRole)) {
    return "hierarchy";
  }
  return null;
};

export const getEditBlockMessage = (
  reason: CompanyUserEditBlockReason,
): string =>
  reason === "self" ? USER_SELF_EDIT_BLOCKED_MESSAGE : USER_EDIT_HIERARCHY_BLOCKED_MESSAGE;

export const listAssignableCompanyRoles = (
  actorRole: CompanyRole | undefined,
  actorIsPlatformAdmin: boolean,
  allRoles: readonly CompanyRole[] = COMPANY_ROLES,
): CompanyRole[] =>
  allRoles.filter((role) => canAssignCompanyRole(actorRole, role, actorIsPlatformAdmin));

export const listInvitableCompanyRoles = (
  actorRole: CompanyRole | undefined,
  actorIsPlatformAdmin: boolean,
  allRoles: readonly CompanyRole[] = COMPANY_ROLES,
): CompanyRole[] =>
  allRoles.filter((role) => canAssignRoleOnInvitation(actorRole, role, actorIsPlatformAdmin));
