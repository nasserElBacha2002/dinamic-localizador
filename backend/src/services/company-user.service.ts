import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import type {
  CreateCompanyUserInput,
  ListCompanyUsersQuery,
  UpdateCompanyUserInput,
} from "../schemas/company-user.schema";
import type { CompanyRole } from "../types/company";
import type { CompanyUserDto } from "../types/company-user";
import { buildPaginationMeta } from "../utils/pagination";
import { logAuditSafe } from "../utils/audit-post-commit";
import { auditService } from "./audit.service";
import {
  assertActorCanManageTargetMembership,
  assertCanAssignCompanyRole,
  assertSelfEditNotAllowed,
} from "./company-user.guards";
import { userInvitationService } from "./user-invitation.service";

const toIsoString = (value: Date | string | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapCompanyUserDto = (
  row: Record<string, unknown>,
  includePlatformAdminFlag: boolean,
): CompanyUserDto => ({
  userId: String(row.user_id),
  name: String(row.name),
  email: String(row.email),
  globalRole: String(row.global_role),
  ...(includePlatformAdminFlag
    ? { isPlatformAdmin: Boolean(row.is_platform_admin) }
    : {}),
  membershipId: String(row.membership_id),
  companyId: String(row.company_id),
  companyRole: String(row.company_role) as CompanyRole,
  membershipStatus: String(row.membership_status) as CompanyUserDto["membershipStatus"],
  isDefault: Boolean(row.is_default),
  createdAt: toIsoString(row.created_at as Date | string) ?? "",
  updatedAt: toIsoString(row.updated_at as Date | string) ?? "",
  lastLoginAt: toIsoString(row.last_login_at as Date | string | null),
});

const assertActiveCompany = async (companyId: string): Promise<void> => {
  const company = await companyRepository.findById(companyId);
  if (!company || company.status !== "ACTIVE") {
    throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
  }
};

const assertTargetUserManageable = async (
  targetUserId: string,
  requesterIsPlatformAdmin: boolean,
): Promise<void> => {
  const targetUser = await userRepository.findById(targetUserId);
  if (!targetUser) {
    throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado.");
  }

  if (targetUser.isPlatformAdmin && !requesterIsPlatformAdmin) {
    throw new AppError(
      403,
      "PLATFORM_ADMIN_PROTECTED",
      "No podés modificar a un superadministrador de plataforma.",
    );
  }
};

const assertLastOwnerProtected = async (
  companyId: string,
  targetUserId: string,
  nextRole: CompanyRole | undefined,
  isDeactivating: boolean,
  _requesterIsPlatformAdmin: boolean,
): Promise<void> => {
  const membership = await userCompanyMembershipRepository.findMembership(targetUserId, companyId);
  if (!membership || membership.status !== "ACTIVE" || membership.role !== "OWNER") {
    return;
  }

  const demotingOwner = isDeactivating || (nextRole !== undefined && nextRole !== "OWNER");
  if (!demotingOwner) {
    return;
  }

  const ownerCount = await userCompanyMembershipRepository.countActiveOwners(companyId);
  if (ownerCount <= 1) {
    throw new AppError(
      409,
      "LAST_OWNER_PROTECTED",
      "No se puede quitar o degradar al último dueño activo de la empresa.",
    );
  }
};

const loadCompanyUserRow = async (
  companyId: string,
  userId: string,
): Promise<Record<string, unknown> | null> =>
  userCompanyMembershipRepository.findCompanyUserRow(companyId, userId);

const sanitizeMembershipAuditSnapshot = (input: {
  role?: CompanyRole;
  status?: string;
  isDefault?: boolean;
}): Record<string, unknown> => {
  const snapshot: Record<string, unknown> = {};
  if (input.role !== undefined) snapshot.role = input.role;
  if (input.status !== undefined) snapshot.status = input.status;
  if (input.isDefault !== undefined) snapshot.isDefault = input.isDefault;
  return snapshot;
};

const logCompanyUserAudit = async (input: {
  companyId: string;
  actorUserId: string;
  targetUserId: string;
  action: string;
  result: "ALLOWED" | "DENIED";
  reason?: string | null;
  modificationType: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  correlationId?: string | null;
}): Promise<void> => {
  await logAuditSafe("company-user-management", async () => {
    await auditService.log(input.companyId, {
      entityType: "company_user_membership",
      entityId: input.targetUserId,
      action: input.action,
      userId: input.actorUserId,
      reason: input.reason ?? null,
      previousData: input.previousData ?? null,
      newData: {
        ...(input.newData ?? {}),
        result: input.result,
        modificationType: input.modificationType,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
        companyId: input.companyId,
        ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      },
    });
  });
};

const resolveModificationType = (input: UpdateCompanyUserInput): string => {
  const parts: string[] = [];
  if (input.role !== undefined) parts.push("role");
  if (input.status !== undefined) parts.push("status");
  if (input.isDefault !== undefined) parts.push("isDefault");
  return parts.length > 0 ? parts.join(",") : "membership_update";
};

export const companyUserService = {
  async list(
    companyId: string,
    query: ListCompanyUsersQuery,
    requesterIsPlatformAdmin: boolean,
  ): Promise<{ data: CompanyUserDto[]; meta: ReturnType<typeof buildPaginationMeta> }> {
    await assertActiveCompany(companyId);

    const result = await userCompanyMembershipRepository.listByCompany(companyId, query);
    return {
      data: result.items.map((row) => mapCompanyUserDto(row, requesterIsPlatformAdmin)),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async getById(
    companyId: string,
    userId: string,
    requesterIsPlatformAdmin: boolean,
  ): Promise<CompanyUserDto> {
    await assertActiveCompany(companyId);
    const row = await loadCompanyUserRow(companyId, userId);
    if (!row) {
      throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
    }

    return mapCompanyUserDto(row, requesterIsPlatformAdmin);
  },

  async create(
    companyId: string,
    input: CreateCompanyUserInput,
    requesterUserId: string,
    requesterIsPlatformAdmin: boolean,
    requesterCompanyRole?: CompanyRole,
  ): Promise<{ data: { invitationId: string; email: string; status: string; expiresAt: string; emailSent: boolean }; message: string }> {
    await assertActiveCompany(companyId);

    try {
      assertCanAssignCompanyRole(requesterCompanyRole, input.role, requesterIsPlatformAdmin);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 403) {
        await logCompanyUserAudit({
          companyId,
          actorUserId: requesterUserId,
          targetUserId: input.email,
          action: "company_user_invite_denied",
          result: "DENIED",
          reason: error.code,
          modificationType: "invite_role",
          newData: { invitedRole: input.role },
        });
      }
      throw error;
    }

    const canAssignOwner = requesterIsPlatformAdmin || requesterCompanyRole === "OWNER";
    const result = await userInvitationService.issueInvitation({
      companyId,
      email: input.email,
      role: input.role,
      inviteeName: input.name,
      invitedByUserId: requesterUserId,
      origin: "MANUAL",
      canAssignOwner,
    });

    await logCompanyUserAudit({
      companyId,
      actorUserId: requesterUserId,
      targetUserId: result.invitation.id,
      action: "company_user_invite_allowed",
      result: "ALLOWED",
      modificationType: "invite_role",
      newData: {
        invitationId: result.invitation.id,
        invitedRole: input.role,
        email: result.invitation.emailNormalized,
      },
    });

    return {
      data: {
        invitationId: result.invitation.id,
        email: result.invitation.emailNormalized,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
        emailSent: result.emailSent,
      },
      message: result.message,
    };
  },

  async update(
    companyId: string,
    userId: string,
    input: UpdateCompanyUserInput,
    requesterUserId: string,
    requesterIsPlatformAdmin: boolean,
    requesterCompanyRole?: CompanyRole,
    correlationId?: string | null,
  ): Promise<CompanyUserDto> {
    const modificationType = resolveModificationType(input);

    // 1) Absolute self-edit ban — before permissions/hierarchy/scope/fields.
    try {
      assertSelfEditNotAllowed(userId, requesterUserId);
    } catch (error) {
      if (error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED") {
        await logCompanyUserAudit({
          companyId,
          actorUserId: requesterUserId,
          targetUserId: userId,
          action: "company_user_self_edit_denied",
          result: "DENIED",
          reason: "SELF_EDIT_NOT_ALLOWED",
          modificationType,
          previousData: null,
          newData: {
            ...sanitizeMembershipAuditSnapshot(input),
            actorIsPlatformAdmin: requesterIsPlatformAdmin,
          },
          correlationId,
        });
      }
      throw error;
    }

    await assertActiveCompany(companyId);
    await assertTargetUserManageable(userId, requesterIsPlatformAdmin);

    const existing = await userCompanyMembershipRepository.findMembership(userId, companyId);
    if (!existing) {
      throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
    }

    const previousSnapshot = sanitizeMembershipAuditSnapshot({
      role: existing.role,
      status: existing.status,
      isDefault: existing.isDefault,
    });

    try {
      // 2–5) Hierarchy + assignable role (permission/scope already enforced by middleware).
      assertActorCanManageTargetMembership(
        requesterCompanyRole,
        existing.role,
        requesterIsPlatformAdmin,
      );
      if (input.role !== undefined && input.role !== existing.role) {
        assertCanAssignCompanyRole(
          requesterCompanyRole,
          input.role,
          requesterIsPlatformAdmin,
        );
      }

      await assertLastOwnerProtected(
        companyId,
        userId,
        input.role,
        input.status === "INACTIVE",
        requesterIsPlatformAdmin,
      );
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 403 || error.statusCode === 409)) {
        await logCompanyUserAudit({
          companyId,
          actorUserId: requesterUserId,
          targetUserId: userId,
          action: "company_user_update_denied",
          result: "DENIED",
          reason: error.code,
          modificationType,
          previousData: previousSnapshot,
          newData: sanitizeMembershipAuditSnapshot(input),
          correlationId,
        });
      }
      throw error;
    }

    const updated = await userCompanyMembershipRepository.updateMembership(companyId, userId, input);
    if (!updated) {
      throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
    }

    if (input.isDefault) {
      await userCompanyMembershipRepository.clearDefaultForUser(userId, companyId);
    }

    const row = await loadCompanyUserRow(companyId, userId);
    if (!row) {
      throw new AppError(500, "COMPANY_USER_LOAD_FAILED", "No se pudo cargar el usuario actualizado.");
    }

    const dto = mapCompanyUserDto(row, requesterIsPlatformAdmin);

    await logCompanyUserAudit({
      companyId,
      actorUserId: requesterUserId,
      targetUserId: userId,
      action: "company_user_update_allowed",
      result: "ALLOWED",
      modificationType,
      previousData: previousSnapshot,
      newData: sanitizeMembershipAuditSnapshot({
        role: dto.companyRole,
        status: dto.membershipStatus,
        isDefault: dto.isDefault,
      }),
      correlationId,
    });

    return dto;
  },

  async deactivate(
    companyId: string,
    userId: string,
    requesterUserId: string,
    requesterIsPlatformAdmin: boolean,
    requesterCompanyRole?: CompanyRole,
    correlationId?: string | null,
  ): Promise<CompanyUserDto> {
    return this.update(
      companyId,
      userId,
      { status: "INACTIVE" },
      requesterUserId,
      requesterIsPlatformAdmin,
      requesterCompanyRole,
      correlationId,
    );
  },
};
