import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { userInvitationRepository } from "../../repositories/identity/user-invitation.repository";
import { userRepository } from "../../repositories/identity/user.repository";
import type { UserCompanyMembership } from "../../types/company";
import { assertEmployeeIsOperationalChargeHolderInTransaction } from "../../utils/employees/operational-charge-holder";
import { operationChargeRevocationService } from "../operations/operation-charge-revocation.service";
import { auditService } from "../audit.service";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

/**
 * Transactional identity flows for Encargado operativo: membership + employee link + revocation audit.
 */
export const operationalManagerActivationService = {
  async ensureOperationalManagerMembershipInTransaction(
    companyId: string,
    userId: string,
    transaction: sql.Transaction,
  ): Promise<UserCompanyMembership> {
    const existing = await userCompanyMembershipRepository.findMembership(userId, companyId, transaction);

    if (!existing) {
      return userCompanyMembershipRepository.create(
        {
          userId,
          companyId,
          role: "OPERATIONAL_MANAGER",
          status: "ACTIVE",
          isDefault: false,
        },
        transaction,
      );
    }

    if (existing.status === "ACTIVE" && existing.role !== "OPERATIONAL_MANAGER") {
      throw new AppError(
        409,
        "OPERATIONAL_MANAGER_DEDICATED_MEMBERSHIP_REQUIRED",
        "El usuario ya tiene otro rol activo en la empresa. Usá una invitación dedicada o un usuario sin membresía activa.",
      );
    }

    if (existing.status === "ACTIVE" && existing.role === "OPERATIONAL_MANAGER") {
      return existing;
    }

    const updated = await userCompanyMembershipRepository.updateMembership(
      companyId,
      userId,
      { role: "OPERATIONAL_MANAGER", status: "ACTIVE" },
      transaction,
    );
    if (!updated) {
      throw new AppError(500, "MEMBERSHIP_UPDATE_FAILED", "No se pudo actualizar la membresía.");
    }
    return updated;
  },

  async establishEmployeeLinkInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: {
      userId: string;
      employeeId: string;
      actorUserId: string | null;
      auditAction: "USER_EMPLOYEE_LINK_CREATED" | "USER_EMPLOYEE_LINK_REPLACED" | "OPERATIONAL_MANAGER_INVITATION_LINKED";
    },
  ): Promise<void> {
    await assertEmployeeIsOperationalChargeHolderInTransaction(companyId, input.employeeId, transaction);

    const existingForEmployee = await companyUserEmployeeLinkRepository.findByEmployeeIdInTransaction(
      companyId,
      transaction,
      input.employeeId,
    );
    if (existingForEmployee && existingForEmployee.userId !== input.userId) {
      throw new AppError(
        409,
        "EMPLOYEE_ALREADY_LINKED",
        "El colaborador ya está vinculado a otro usuario de la empresa.",
      );
    }

    const existingForUser = await companyUserEmployeeLinkRepository.findByUserIdForUpdateInTransaction(
      companyId,
      transaction,
      input.userId,
    );

    if (existingForUser?.employeeId === input.employeeId) {
      return;
    }

    if (!existingForUser) {
      const created = await companyUserEmployeeLinkRepository.createInTransaction(companyId, transaction, {
        userId: input.userId,
        employeeId: input.employeeId,
        createdByUserId: input.actorUserId,
      });
      await auditService.log(
        companyId,
        {
          entityType: "company_user_employee_link",
          entityId: input.userId,
          action: input.auditAction,
          newData: { employeeId: created.employeeId },
          userId: input.actorUserId,
        },
        transaction,
      );
      return;
    }

    const previousEmployeeId = existingForUser.employeeId;
    const revokedAssignmentIds = await operationChargeRevocationService.revokeEffectiveForUserInTransaction(
      companyId,
      transaction,
      {
        userId: input.userId,
        actorUserId: input.actorUserId,
        reason: "USER_EMPLOYEE_LINK_REPLACED",
      },
    );

    const updated = await companyUserEmployeeLinkRepository.replaceInTransaction(companyId, transaction, {
      userId: input.userId,
      employeeId: input.employeeId,
      replacedByUserId: input.actorUserId,
    });

    await auditService.log(
      companyId,
      {
        entityType: "company_user_employee_link",
        entityId: input.userId,
        action: "USER_EMPLOYEE_LINK_REPLACED",
        previousData: { employeeId: previousEmployeeId },
        newData: {
          employeeId: updated.employeeId,
          revokedAssignmentIds,
          sourceAction: input.auditAction,
        },
        userId: input.actorUserId,
      },
      transaction,
    );
  },

  async linkExistingUser(
    companyId: string,
    actorUserId: string | null,
    targetUserId: string,
    employeeId: string,
  ): Promise<void> {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      await this.ensureOperationalManagerMembershipInTransaction(companyId, targetUserId, transaction);
      await this.establishEmployeeLinkInTransaction(companyId, transaction, {
        userId: targetUserId,
        employeeId,
        actorUserId,
        auditAction: "USER_EMPLOYEE_LINK_CREATED",
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      if (isDuplicateKeyError(error)) {
        throw new AppError(
          409,
          "EMPLOYEE_ALREADY_LINKED",
          "El colaborador ya está vinculado a otro usuario de la empresa.",
        );
      }
      throw error;
    }
  },

  async finalizeInvitationAcceptInTransaction(
    companyId: string,
    transaction: sql.Transaction,
    input: { userId: string; employeeId: string },
  ): Promise<void> {
    await assertEmployeeIsOperationalChargeHolderInTransaction(companyId, input.employeeId, transaction);
    await this.establishEmployeeLinkInTransaction(companyId, transaction, {
      userId: input.userId,
      employeeId: input.employeeId,
      actorUserId: input.userId,
      auditAction: "OPERATIONAL_MANAGER_INVITATION_LINKED",
    });
  },

  async revokeOperationalAccess(
    companyId: string,
    actorUserId: string | null,
    input: { userId: string; employeeId: string },
  ): Promise<void> {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const link = await companyUserEmployeeLinkRepository.findByUserIdForUpdateInTransaction(
        companyId,
        transaction,
        input.userId,
      );
      if (!link || link.employeeId !== input.employeeId) {
        throw new AppError(404, "USER_EMPLOYEE_LINK_NOT_FOUND", "No hay acceso operativo vinculado.");
      }

      const revokedAssignmentIds = await operationChargeRevocationService.revokeEffectiveForUserInTransaction(
        companyId,
        transaction,
        {
          userId: input.userId,
          actorUserId,
          reason: "USER_EMPLOYEE_LINK_REMOVED",
        },
      );

      const removed = await companyUserEmployeeLinkRepository.deleteInTransaction(
        companyId,
        transaction,
        input.userId,
      );
      if (!removed) {
        throw new AppError(404, "USER_EMPLOYEE_LINK_NOT_FOUND", "No hay acceso operativo vinculado.");
      }

      const membership = await userCompanyMembershipRepository.findMembership(
        input.userId,
        companyId,
        transaction,
      );
      if (membership?.role === "OPERATIONAL_MANAGER" && membership.status === "ACTIVE") {
        await userCompanyMembershipRepository.updateMembership(
          companyId,
          input.userId,
          { status: "INACTIVE" },
          transaction,
        );
      }

      const revokedInvitations = await userInvitationRepository.revokePendingByLinkedEmployeeInTransaction(
        companyId,
        transaction,
        input.employeeId,
      );

      await userRepository.bumpTokenVersion(input.userId, transaction);

      await auditService.log(
        companyId,
        {
          entityType: "company_user_employee_link",
          entityId: input.userId,
          action: "OPERATIONAL_MANAGER_ACCESS_REVOKED",
          previousData: { employeeId: input.employeeId },
          newData: { revokedAssignmentIds, revokedInvitations },
          userId: actorUserId,
        },
        transaction,
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
