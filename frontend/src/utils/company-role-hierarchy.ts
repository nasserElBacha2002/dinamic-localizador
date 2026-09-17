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

export const USER_SELF_DEACTIVATION_BLOCKED_MESSAGE =
  "No podés inactivar tu propio usuario. La modificación debe ser realizada por otro usuario autorizado.";

export const USER_DEACTIVATION_HIERARCHY_BLOCKED_MESSAGE =
  "Solo podés inactivar usuarios con un rol estrictamente inferior al tuyo.";

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

export type CompanyUserPrivilegedActionBlockReason = "self" | "hierarchy";

/**
 * UI gate for privileged membership actions (role / isDefault / deactivate / reactivate).
 * Backend remains authoritative. Personal profile uses canEditPersonalProfile.
 */
export const getCompanyUserPrivilegedActionBlockReason = (input: {
  actorUserId: string | undefined;
  actorRole: CompanyRole | undefined;
  actorIsPlatformAdmin: boolean;
  targetUserId: string;
  targetRole: CompanyRole;
}): CompanyUserPrivilegedActionBlockReason | null => {
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

/** Alias kept for inactivation messaging helpers. */
export const getCompanyUserDeactivationBlockReason = getCompanyUserPrivilegedActionBlockReason;

export const getDeactivationBlockMessage = (
  reason: CompanyUserPrivilegedActionBlockReason,
): string =>
  reason === "self"
    ? USER_SELF_DEACTIVATION_BLOCKED_MESSAGE
    : USER_DEACTIVATION_HIERARCHY_BLOCKED_MESSAGE;

/** Global profile fields: only self or platform admin (matches backend). */
export const canEditPersonalProfile = (input: {
  actorUserId: string | undefined;
  actorIsPlatformAdmin: boolean;
  targetUserId: string;
}): boolean => {
  if (input.actorIsPlatformAdmin) {
    return true;
  }
  return Boolean(input.actorUserId && input.actorUserId === input.targetUserId);
};

export const resolveCompanyUserCapabilities = (input: {
  actorUserId: string | undefined;
  actorRole: CompanyRole | undefined;
  actorIsPlatformAdmin: boolean;
  targetUserId: string;
  targetRole: CompanyRole;
  targetStatus: "ACTIVE" | "INACTIVE";
}): {
  canEditProfile: boolean;
  canChangeRole: boolean;
  canChangeDefaultCompany: boolean;
  canDeactivate: boolean;
  canReactivate: boolean;
} => {
  const privilegedBlocked = getCompanyUserPrivilegedActionBlockReason(input);
  const privileged = privilegedBlocked === null;
  return {
    canEditProfile: canEditPersonalProfile(input),
    canChangeRole: privileged,
    canChangeDefaultCompany: privileged,
    canDeactivate: privileged && input.targetStatus === "ACTIVE",
    canReactivate: privileged && input.targetStatus === "INACTIVE",
  };
};

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
