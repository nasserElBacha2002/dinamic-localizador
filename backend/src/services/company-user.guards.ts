import { AppError } from "../errors/app-error";
import {
  canAssignCompanyRole,
  canAssignRoleOnInvitation,
  isStrictlySuperiorRole,
} from "../constants/company-role-hierarchy";
import type { CompanyMembershipStatus, CompanyRole, UserCompanyMembership } from "../types/company";
import type { UpdateCompanyUserInput } from "../schemas/company-user.schema";

export const SELF_EDIT_NOT_ALLOWED_MESSAGE =
  "No podés editar tu propio usuario. La modificación debe ser realizada por otro usuario autorizado.";

export const INSUFFICIENT_ROLE_HIERARCHY_MESSAGE =
  "No podés editar este usuario. La modificación debe ser realizada por un usuario con un rango superior.";

export const ROLE_NOT_ASSIGNABLE_HIERARCHY_MESSAGE =
  "No podés asignar un rol igual o superior al tuyo.";

/**
 * Phase 1 — absolute self-edit ban for administrative mutations.
 * No role, platform-admin, or permission exception.
 */
export const assertSelfAdministrativeMutationAllowed = (
  targetUserId: string,
  requesterUserId: string,
): void => {
  if (targetUserId === requesterUserId) {
    throw new AppError(403, "SELF_EDIT_NOT_ALLOWED", SELF_EDIT_NOT_ALLOWED_MESSAGE);
  }
};

/** @deprecated Alias — prefer assertSelfAdministrativeMutationAllowed */
export const assertSelfEditNotAllowed = assertSelfAdministrativeMutationAllowed;

/**
 * Actor must be strictly superior to the target membership role.
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
 * Phase 2 — membership mutation authorization (hierarchy + assigned role).
 * Does not replace permission middleware (`users:manage`) or company scope.
 * Self-edit must already have been rejected (phase 1).
 */
export const assertMembershipMutationAllowed = (input: {
  requesterCompanyRole: CompanyRole | undefined;
  requesterIsPlatformAdmin: boolean;
  existing: Pick<UserCompanyMembership, "role" | "status">;
  update: UpdateCompanyUserInput;
}): void => {
  assertActorCanManageTargetMembership(
    input.requesterCompanyRole,
    input.existing.role,
    input.requesterIsPlatformAdmin,
  );

  if (input.update.role !== undefined && input.update.role !== input.existing.role) {
    assertCanAssignCompanyRole(
      input.requesterCompanyRole,
      input.update.role,
      input.requesterIsPlatformAdmin,
    );
  }
};

/**
 * Full authorization for membership updates (self + hierarchy + assigned role).
 * Prefer calling phase 1 then phase 2 separately when audit/company checks interleave.
 */
export const assertCompanyUserModificationAllowed = (input: {
  targetUserId: string;
  requesterUserId: string;
  requesterCompanyRole: CompanyRole | undefined;
  requesterIsPlatformAdmin: boolean;
  existing: Pick<UserCompanyMembership, "role" | "status">;
  update: UpdateCompanyUserInput;
}): void => {
  assertSelfAdministrativeMutationAllowed(input.targetUserId, input.requesterUserId);
  assertMembershipMutationAllowed({
    requesterCompanyRole: input.requesterCompanyRole,
    requesterIsPlatformAdmin: input.requesterIsPlatformAdmin,
    existing: input.existing,
    update: input.update,
  });
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
