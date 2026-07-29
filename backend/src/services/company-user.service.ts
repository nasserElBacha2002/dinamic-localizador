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
import {
  assertSelfMembershipChangeNotAllowed,
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
  requesterIsPlatformAdmin: boolean,
): Promise<void> => {
  if (requesterIsPlatformAdmin) {
    return;
  }

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
  ): Promise<CompanyUserDto> {
    await assertActiveCompany(companyId);
    await assertTargetUserManageable(userId, requesterIsPlatformAdmin);

    const existing = await userCompanyMembershipRepository.findMembership(userId, companyId);
    if (!existing) {
      throw new AppError(404, "COMPANY_USER_NOT_FOUND", "Usuario de empresa no encontrado.");
    }

    await assertLastOwnerProtected(
      companyId,
      userId,
      input.role,
      input.status === "INACTIVE",
      requesterIsPlatformAdmin,
    );

    assertSelfMembershipChangeNotAllowed(
      userId,
      requesterUserId,
      requesterIsPlatformAdmin,
      input,
      existing,
    );

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

    return mapCompanyUserDto(row, requesterIsPlatformAdmin);
  },

  async deactivate(
    companyId: string,
    userId: string,
    requesterUserId: string,
    requesterIsPlatformAdmin: boolean,
  ): Promise<CompanyUserDto> {
    return this.update(
      companyId,
      userId,
      { status: "INACTIVE" },
      requesterUserId,
      requesterIsPlatformAdmin,
    );
  },
};
