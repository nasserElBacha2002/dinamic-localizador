import type { CompanyRole } from "../types/company";
import { COMPANY_ROLES } from "../types/company";

/**
 * Backend authority for company role hierarchy.
 * Higher number = higher privilege. Comparison must use ranks, not role names.
 */
export const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  OWNER: 100,
  ADMIN: 80,
  HR: 60,
  SUPERVISOR: 40,
  OPERATOR: 20,
  READ_ONLY: 10,
};

export const getCompanyRoleRank = (role: CompanyRole): number => COMPANY_ROLE_RANK[role];

/** True when actor rank is strictly greater than target rank. */
export const isStrictlySuperiorRole = (
  actorRole: CompanyRole,
  targetRole: CompanyRole,
): boolean => getCompanyRoleRank(actorRole) > getCompanyRoleRank(targetRole);

/**
 * Membership update policy: actor may assign a role only when that role is
 * strictly below the actor's rank. Platform admins may assign any company role.
 */
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

/**
 * Invitation policy (distinct from membership updates):
 * - platform admin: any role
 * - OWNER: any role including OWNER (multi-owner self-management)
 * - other roles: strictly inferior ranks only
 */
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

export const listAssignableCompanyRoles = (
  actorRole: CompanyRole | undefined,
  actorIsPlatformAdmin: boolean,
): CompanyRole[] =>
  COMPANY_ROLES.filter((role) => canAssignCompanyRole(actorRole, role, actorIsPlatformAdmin));

export const listInvitableCompanyRoles = (
  actorRole: CompanyRole | undefined,
  actorIsPlatformAdmin: boolean,
): CompanyRole[] =>
  COMPANY_ROLES.filter((role) =>
    canAssignRoleOnInvitation(actorRole, role, actorIsPlatformAdmin),
  );
