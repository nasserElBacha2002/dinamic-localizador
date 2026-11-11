import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import type { CompanyUserEmployeeLink } from "../../types/operation-charge";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";
import { assertEmployeeIsOperationalChargeHolder } from "../../utils/employees/operational-charge-holder";
import { operationChargeRevocationService } from "../operations/operation-charge-revocation.service";
import { auditService } from "../audit.service";

const assertActiveMembership = async (companyId: string, userId: string): Promise<void> => {
  const membership = await userCompanyMembershipRepository.findActiveMembership(userId, companyId);
  if (!membership) {
    throw new AppError(
      404,
      "MEMBERSHIP_NOT_FOUND",
      "El usuario no tiene una membresía activa en esta empresa.",
    );
  }
};

const assertActiveEmployee = async (companyId: string, employeeId: string): Promise<void> => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador no encontrado.");
  }
  if (!employee.active) {
    throw new AppError(409, "EMPLOYEE_INACTIVE", "No se puede vincular un colaborador inactivo.");
  }
};

const assertEmployeeNotLinkedToOtherUser = async (
  companyId: string,
  employeeId: string,
  userId: string,
): Promise<void> => {
  const existingForEmployee = await companyUserEmployeeLinkRepository.findByEmployeeId(
    companyId,
    employeeId,
  );
  if (existingForEmployee && existingForEmployee.userId !== userId) {
    throw new AppError(
      409,
      "EMPLOYEE_ALREADY_LINKED",
      "El colaborador ya está vinculado a otro usuario de la empresa.",
    );
  }
};

export const companyUserEmployeeLinkService = {
  async getByUserId(companyId: string, userId: string): Promise<CompanyUserEmployeeLink | null> {
    return companyUserEmployeeLinkRepository.findByUserId(companyId, userId);
  },

  async getByEmployeeId(companyId: string, employeeId: string): Promise<CompanyUserEmployeeLink | null> {
    return companyUserEmployeeLinkRepository.findByEmployeeId(companyId, employeeId);
  },

  async createLink(
    companyId: string,
    actorUserId: string | null,
    userId: string,
    employeeId: string,
  ): Promise<CompanyUserEmployeeLink> {
    await assertActiveMembership(companyId, userId);
    await assertActiveEmployee(companyId, employeeId);
    await assertEmployeeIsOperationalChargeHolder(companyId, employeeId);
    await assertEmployeeNotLinkedToOtherUser(companyId, employeeId, userId);

    const existingForUser = await companyUserEmployeeLinkRepository.findByUserId(companyId, userId);
    if (existingForUser) {
      throw new AppError(
        409,
        "USER_EMPLOYEE_LINK_EXISTS",
        "El usuario ya tiene un colaborador vinculado. Usá reemplazo explícito.",
      );
    }

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const created = await companyUserEmployeeLinkRepository.createInTransaction(companyId, transaction, {
        userId,
        employeeId,
        createdByUserId: actorUserId,
      });
      await transaction.commit();
      return created;
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

  async replaceLink(
    companyId: string,
    actorUserId: string | null,
    userId: string,
    employeeId: string,
  ): Promise<CompanyUserEmployeeLink> {
    await assertActiveMembership(companyId, userId);
    await assertActiveEmployee(companyId, employeeId);
    await assertEmployeeIsOperationalChargeHolder(companyId, employeeId);
    await assertEmployeeNotLinkedToOtherUser(companyId, employeeId, userId);

    const existingForUser = await companyUserEmployeeLinkRepository.findByUserId(companyId, userId);
    if (!existingForUser) {
      throw new AppError(
        404,
        "USER_EMPLOYEE_LINK_NOT_FOUND",
        "No existe un vínculo para este usuario. Creá el vínculo primero.",
      );
    }
    if (existingForUser.employeeId === employeeId) {
      throw new AppError(
        409,
        "USER_EMPLOYEE_LINK_UNCHANGED",
        "El usuario ya está vinculado a ese colaborador.",
      );
    }

    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      const previousEmployeeId = existingForUser.employeeId;
      const revokedAssignmentIds = await operationChargeRevocationService.revokeEffectiveForUserInTransaction(
        companyId,
        transaction,
        {
          userId,
          actorUserId,
          reason: "USER_EMPLOYEE_LINK_REPLACED",
        },
      );

      const updated = await companyUserEmployeeLinkRepository.replaceInTransaction(companyId, transaction, {
        userId,
        employeeId,
        replacedByUserId: actorUserId,
      });

      await auditService.log(
        companyId,
        {
          entityType: "company_user_employee_link",
          entityId: userId,
          action: "USER_EMPLOYEE_LINK_REPLACED",
          previousData: { employeeId: previousEmployeeId },
          newData: {
            employeeId,
            revokedAssignmentIds,
          },
          userId: actorUserId,
        },
        transaction,
      );

      await transaction.commit();
      return updated;
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

  async removeLink(companyId: string, actorUserId: string | null, userId: string): Promise<void> {
    const transaction = new sql.Transaction(getPool());
    await transaction.begin();
    try {
      await operationChargeRevocationService.revokeEffectiveForUserInTransaction(companyId, transaction, {
        userId,
        actorUserId,
        reason: "USER_EMPLOYEE_LINK_REMOVED",
      });

      const removed = await companyUserEmployeeLinkRepository.deleteInTransaction(
        companyId,
        transaction,
        userId,
      );
      if (!removed) {
        throw new AppError(404, "USER_EMPLOYEE_LINK_NOT_FOUND", "No existe un vínculo para este usuario.");
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },
};
