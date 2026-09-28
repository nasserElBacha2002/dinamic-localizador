import { AppError } from "../errors/app-error";
import {
  canAssignCompanyRole,
  canAssignRoleOnInvitation,
  isStrictlySuperiorRole,
} from "../constants/company-role-hierarchy";
import type { CompanyMembershipStatus, CompanyRole, UserCompanyMembership } from "../types/company";
import type { UpdateCompanyUserInput } from "../schemas/company-user.schema";

export const SELF_DEACTIVATION_NOT_ALLOWED_MESSAGE =
  "No podés inactivar tu propio usuario. La modificación debe ser realizada por otro usuario autorizado.";

export const TARGET_ROLE_NOT_LOWER_MESSAGE =
  "Solo podés inactivar usuarios con un rol estrictamente inferior al tuyo.";

export const USER_UPDATE_FORBIDDEN_MESSAGE =
  "No tenés autorización para realizar esta actualización de usuario.";

export const SELF_ROLE_CHANGE_NOT_ALLOWED_MESSAGE =
  "No podés cambiar tu propio rol. La modificación debe ser realizada por otro usuario autorizado.";

export const SELF_DEFAULT_COMPANY_CHANGE_NOT_ALLOWED_MESSAGE =
  "No podés marcar o desmarcar esta empresa como predeterminada en tu propio usuario.";

export const DEFAULT_COMPANY_HIERARCHY_NOT_ALLOWED_MESSAGE =
  "Solo podés cambiar la empresa predeterminada de usuarios con un rol estrictamente inferior al tuyo.";

export const PERSONAL_PROFILE_EDIT_FORBIDDEN_MESSAGE =
  "Solo podés modificar nombre, email o teléfono de tu propio usuario (o como superadmin de plataforma).";

export const ROLE_NOT_ASSIGNABLE_HIERARCHY_MESSAGE =
  "No podés asignar un rol igual o superior al tuyo.";

export const INSUFFICIENT_ROLE_HIERARCHY_MESSAGE =
  "No podés modificar el rol de este usuario. La modificación debe ser realizada por un usuario con un rango superior.";

export const isActiveToInactiveTransition = (
  existingStatus: CompanyMembershipStatus,
  nextStatus: CompanyMembershipStatus | undefined,
): boolean => existingStatus === "ACTIVE" && nextStatus === "INACTIVE";

/**
 * name / email / phone_number live on global `users` (login identity + contact).
 * Only the account owner or a platform admin may change them — never via company
 * `users:manage` alone (would allow cross-tenant identity mutation).
 */
export const assertPersonalProfileMutationAllowed = (input: {
  targetUserId: string;
  requesterUserId: string;
  actorIsPlatformAdmin: boolean;
}): void => {
  if (input.targetUserId === input.requesterUserId) {
    return;
  }
  if (input.actorIsPlatformAdmin) {
    return;
  }
  throw new AppError(403, "USER_UPDATE_FORBIDDEN", PERSONAL_PROFILE_EDIT_FORBIDDEN_MESSAGE);
};

/**
 * Privileged membership actions (role, isDefault, inactivation) require a strictly
 * superior actor, or a platform admin acting on someone else — never on self.
 */
export const assertActorCanMutatePrivilegedMembershipFields = (input: {
  targetUserId: string;
  requesterUserId: string;
  actorRole: CompanyRole | undefined;
  targetRole: CompanyRole;
  actorIsPlatformAdmin: boolean;
  selfErrorMessage: string;
  hierarchyErrorMessage: string;
  selfErrorCode?: string;
  hierarchyErrorCode?: string;
}): void => {
  if (input.targetUserId === input.requesterUserId) {
    throw new AppError(
      403,
      input.selfErrorCode ?? "USER_UPDATE_FORBIDDEN",
      input.selfErrorMessage,
    );
  }

  if (input.actorIsPlatformAdmin) {
    return;
  }

  if (!input.actorRole || !isStrictlySuperiorRole(input.actorRole, input.targetRole)) {
    throw new AppError(
      403,
      input.hierarchyErrorCode ?? "USER_UPDATE_FORBIDDEN",
      input.hierarchyErrorMessage,
    );
  }
};

/**
 * Hierarchical inactivation gate. Runs only for a real ACTIVE → INACTIVE transition.
 * Platform admins may inactivate any company membership except themselves.
 */
export const assertDeactivationAllowed = (input: {
  targetUserId: string;
  requesterUserId: string;
  actorRole: CompanyRole | undefined;
  targetRole: CompanyRole;
  actorIsPlatformAdmin: boolean;
}): void => {
  assertActorCanMutatePrivilegedMembershipFields({
    ...input,
    selfErrorMessage: SELF_DEACTIVATION_NOT_ALLOWED_MESSAGE,
    hierarchyErrorMessage: TARGET_ROLE_NOT_LOWER_MESSAGE,
    selfErrorCode: "SELF_DEACTIVATION_NOT_ALLOWED",
    hierarchyErrorCode: "TARGET_ROLE_NOT_LOWER",
  });
};

/**
 * Actor must be strictly superior to the target membership role (role mutations).
 * Platform admins bypass company-role hierarchy.
 */
export const assertActorCanManageTargetMembership = (
  actorRole: CompanyRole | undefined,
  targetRole: CompanyRole,
  actorIsPlatformAdmin: boolean,
): void => {
  if (actorIsPlatformAdmin) {
    return;
  }

  if (!actorRole || !isStrictlySuperiorRole(actorRole, targetRole)) {
    throw new AppError(
      403,
      "INSUFFICIENT_ROLE_HIERARCHY",
      INSUFFICIENT_ROLE_HIERARCHY_MESSAGE,
    );
  }
};

export const assertCanAssignCompanyRole = (
  actorRole: CompanyRole | undefined,
  roleToAssign: CompanyRole,
  actorIsPlatformAdmin: boolean,
): void => {
  if (!canAssignCompanyRole(actorRole, roleToAssign, actorIsPlatformAdmin)) {
    throw new AppError(
      403,
      "INSUFFICIENT_ROLE_HIERARCHY",
      ROLE_NOT_ASSIGNABLE_HIERARCHY_MESSAGE,
    );
  }
};

export const assertCanAssignRoleOnInvitation = (
  actorRole: CompanyRole | undefined,
  roleToAssign: CompanyRole,
  actorIsPlatformAdmin: boolean,
): void => {
  if (!canAssignRoleOnInvitation(actorRole, roleToAssign, actorIsPlatformAdmin)) {
    throw new AppError(
      403,
      "INSUFFICIENT_ROLE_HIERARCHY",
      ROLE_NOT_ASSIGNABLE_HIERARCHY_MESSAGE,
    );
  }
};

/**
 * Membership mutation authorization:
 * - role / isDefault require strictly superior actor (never self, never peer);
 * - ACTIVE → INACTIVE uses the inactivation-only hierarchy;
 * - personal / non-inactivating status updates are not blocked by peer/superior rank.
 */
export const assertMembershipMutationAllowed = (input: {
  targetUserId: string;
  requesterUserId: string;
  requesterCompanyRole: CompanyRole | undefined;
  requesterIsPlatformAdmin: boolean;
  existing: Pick<UserCompanyMembership, "role" | "status" | "isDefault">;
  update: UpdateCompanyUserInput;
}): void => {
  const roleChanging =
    input.update.role !== undefined && input.update.role !== input.existing.role;
  const defaultChanging =
    input.update.isDefault !== undefined &&
    input.update.isDefault !== input.existing.isDefault;

  if (roleChanging) {
    assertActorCanMutatePrivilegedMembershipFields({
      targetUserId: input.targetUserId,
      requesterUserId: input.requesterUserId,
      actorRole: input.requesterCompanyRole,
      targetRole: input.existing.role,
      actorIsPlatformAdmin: input.requesterIsPlatformAdmin,
      selfErrorMessage: SELF_ROLE_CHANGE_NOT_ALLOWED_MESSAGE,
      hierarchyErrorMessage: INSUFFICIENT_ROLE_HIERARCHY_MESSAGE,
      selfErrorCode: "USER_UPDATE_FORBIDDEN",
      hierarchyErrorCode: "INSUFFICIENT_ROLE_HIERARCHY",
    });
    assertCanAssignCompanyRole(
      input.requesterCompanyRole,
      input.update.role!,
      input.requesterIsPlatformAdmin,
    );
  }

  if (defaultChanging) {
    assertActorCanMutatePrivilegedMembershipFields({
      targetUserId: input.targetUserId,
      requesterUserId: input.requesterUserId,
      actorRole: input.requesterCompanyRole,
      targetRole: input.existing.role,
      actorIsPlatformAdmin: input.requesterIsPlatformAdmin,
      selfErrorMessage: SELF_DEFAULT_COMPANY_CHANGE_NOT_ALLOWED_MESSAGE,
      hierarchyErrorMessage: DEFAULT_COMPANY_HIERARCHY_NOT_ALLOWED_MESSAGE,
      selfErrorCode: "USER_UPDATE_FORBIDDEN",
      hierarchyErrorCode: "USER_UPDATE_FORBIDDEN",
    });
  }

  if (isActiveToInactiveTransition(input.existing.status, input.update.status)) {
    assertDeactivationAllowed({
      targetUserId: input.targetUserId,
      requesterUserId: input.requesterUserId,
      actorRole: input.requesterCompanyRole,
      targetRole: input.existing.role,
      actorIsPlatformAdmin: input.requesterIsPlatformAdmin,
    });
  }
};

/**
 * Full authorization for membership updates (role + inactivation).
 * Personal-field-only updates should not call this when no membership fields change.
 */
export const assertCompanyUserModificationAllowed = (input: {
  targetUserId: string;
  requesterUserId: string;
  requesterCompanyRole: CompanyRole | undefined;
  requesterIsPlatformAdmin: boolean;
  existing: Pick<UserCompanyMembership, "role" | "status" | "isDefault">;
  update: UpdateCompanyUserInput;
}): void => {
  assertMembershipMutationAllowed(input);
};

export const isLastOwnerDemotion = (
  existingRole: CompanyRole,
  existingStatus: CompanyMembershipStatus,
  nextRole: CompanyRole | undefined,
  nextStatus: CompanyMembershipStatus | undefined,
): boolean => {
  if (existingRole !== "OWNER" || existingStatus !== "ACTIVE") {
    return false;
  }

  const deactivating = nextStatus === "INACTIVE";
  const demoting = nextRole !== undefined && nextRole !== "OWNER";
  return deactivating || demoting;
};
