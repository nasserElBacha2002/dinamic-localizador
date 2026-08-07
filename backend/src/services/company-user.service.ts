import { createHash } from "node:crypto";
import { AppError } from "../errors/app-error";
import { listAssignableCompanyRoles, listInvitableCompanyRoles } from "../constants/company-role-hierarchy";
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
import { normalizeEmail } from "../utils/password";
import { auditService } from "./audit.service";
import {
  assertCanAssignRoleOnInvitation,
  assertMembershipMutationAllowed,
  assertSelfAdministrativeMutationAllowed,
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

const invitationEntityIdFromEmail = (email: string): string =>
  createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);

const logCompanyUserAudit = async (input: {
  companyId: string;
  actorUserId: string;
  entityType: "company_user_membership" | "user_invitation";
  entityId: string;
  action: string;
  result: "ALLOWED" | "DENIED";
  reason?: string | null;
  modificationType: string;
  previousData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  correlationId?: string | null;
  targetUserId?: string;
}): Promise<void> => {
  await logAuditSafe("company-user-management", async () => {
    await auditService.log(input.companyId, {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.actorUserId,
      reason: input.reason ?? null,
      previousData: input.previousData ?? null,
      newData: {
        ...(input.newData ?? {}),
        result: input.result,
        modificationType: input.modificationType,
        actorUserId: input.actorUserId,
        ...(input.targetUserId ? { targetUserId: input.targetUserId } : {}),
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

/**
 * Administrative self-edit inventory (company users domain):
 * - PATCH /companies/:id/users/:userId
 * - PATCH /companies/:id/users/:userId/deactivate
 * There is no HTTP admin path to mutate global user name/role/password;
 * password updates are auth/script-only and are not administrative membership edits.
 */
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
    const row = await userCompanyMembershipRepository.findCompanyUserRow(companyId, userId);
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
      assertCanAssignRoleOnInvitation(requesterCompanyRole, input.role, requesterIsPlatformAdmin);
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 403) {
        await logCompanyUserAudit({
          companyId,
          actorUserId: requesterUserId,
          entityType: "user_invitation",
          entityId: invitationEntityIdFromEmail(input.email),
          action: "company_user_invite_denied",
          result: "DENIED",
          reason: error.code,
          modificationType: "invite_role",
          newData: { invitedRole: input.role },
        });
      }
      throw error;
    }

    // OWNER (and platform admin) may invite another OWNER; mirrors invitation policy.
    const canAssignOwner =
      requesterIsPlatformAdmin || requesterCompanyRole === "OWNER";
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
      entityType: "user_invitation",
      entityId: result.invitation.id,
      action: "company_user_invite_allowed",
      result: "ALLOWED",
      modificationType: "invite_role",
      newData: {
        invitationId: result.invitation.id,
        invitedRole: input.role,
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

    // Phase 1: absolute self-edit ban (identity only — before writes).
    try {
      assertSelfAdministrativeMutationAllowed(userId, requesterUserId);
    } catch (error) {
      if (error instanceof AppError && error.code === "SELF_EDIT_NOT_ALLOWED") {
        // Defer persistent audit until company scope is valid.
        try {
          await assertActiveCompany(companyId);
          await logCompanyUserAudit({
            companyId,
            actorUserId: requesterUserId,
            entityType: "company_user_membership",
            entityId: userId,
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
        } catch {
          // Company invalid / audit failure must not change the self-edit denial.
        }
      }
      throw error;
    }

    await assertActiveCompany(companyId);
    await assertTargetUserManageable(userId, requesterIsPlatformAdmin);

    let previousSnapshot: Record<string, unknown> = {};
    let row: Record<string, unknown>;

    try {
      const result = await userCompanyMembershipRepository.applyMembershipUpdateWithGuards(
        companyId,
        userId,
        input,
        (existing) => {
          previousSnapshot = sanitizeMembershipAuditSnapshot({
            role: existing.role,
            status: existing.status,
            isDefault: existing.isDefault,
          });
          assertMembershipMutationAllowed({
            requesterCompanyRole,
            requesterIsPlatformAdmin,
            existing,
            update: input,
          });
        },
        async ({ transaction, row: lockedRow }) => {
          const dtoPreview = mapCompanyUserDto(lockedRow, requesterIsPlatformAdmin);
          // CRITICAL_AUDIT: privilege change must not commit without audit_logs.
          await auditService.log(
            companyId,
            {
              entityType: "company_user_membership",
              entityId: userId,
              action: "company_user_update_allowed",
              userId: requesterUserId,
              reason: null,
              previousData: previousSnapshot,
              newData: {
                ...sanitizeMembershipAuditSnapshot({
                  role: dtoPreview.companyRole,
                  status: dtoPreview.membershipStatus,
                  isDefault: dtoPreview.isDefault,
                }),
                result: "ALLOWED",
                modificationType,
                actorUserId: requesterUserId,
                targetUserId: userId,
                companyId,
                ...(correlationId ? { correlationId } : {}),
              },
            },
            transaction,
          );
        },
      );
      row = result.row;
    } catch (error) {
      if (error instanceof AppError && (error.statusCode === 403 || error.statusCode === 409)) {
        // BEST_EFFORT: denial attempts have no successful business mutation to couple.
        await logCompanyUserAudit({
          companyId,
          actorUserId: requesterUserId,
          entityType: "company_user_membership",
          entityId: userId,
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

    return mapCompanyUserDto(row, requesterIsPlatformAdmin);
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

  /** Capabilities for UI — backend remains authority on enforcement. */
  resolveRoleCapabilities(
    requesterCompanyRole: CompanyRole | undefined,
    requesterIsPlatformAdmin: boolean,
  ): { assignableRoles: CompanyRole[]; invitableRoles: CompanyRole[] } {
    return {
      assignableRoles: listAssignableCompanyRoles(
        requesterCompanyRole,
        requesterIsPlatformAdmin,
      ),
      invitableRoles: listInvitableCompanyRoles(
        requesterCompanyRole,
        requesterIsPlatformAdmin,
      ),
    };
  },
};
