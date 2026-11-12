import sql from "mssql";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import { companyUserEmployeeLinkRepository } from "../../repositories/companies/company-user-employee-link.repository";
import { operationalManagerActivationService } from "./operational-manager-activation.service";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { userRepository } from "../../repositories/identity/user.repository";
import { userInvitationService } from "../identity/user-invitation.service";
import { isEmployeeRecordOperationalChargeHolder } from "../../utils/employees/operational-charge-holder";
import { canAssignCompanyRole } from "../../constants/company-role-hierarchy";
import type { CompanyRole } from "../../types/company";

export type EmployeeOperationalAccessStatus = {
  eligible: boolean;
  link: {
    userId: string;
    userName: string;
    userEmail: string;
    membershipStatus: string;
    companyRole: CompanyRole;
  } | null;
  pendingInvitations: Array<{
    id: string;
    email: string;
    status: string;
    expiresAt: string;
  }>;
};

const assertEmployeeEligible = async (companyId: string, employeeId: string) => {
  const employee = await employeeRepository.findById(companyId, employeeId);
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador no encontrado.");
  }
  const isHolder = await isEmployeeRecordOperationalChargeHolder(companyId, employee);
  if (!isHolder) {
    throw new AppError(
      409,
      "EMPLOYEE_NOT_CHARGE_HOLDER",
      "El colaborador debe tener la categoría Encargado activa.",
    );
  }
  return employee;
};

export const employeeOperationalAccessService = {
  async getStatus(companyId: string, employeeId: string): Promise<EmployeeOperationalAccessStatus> {
    const employee = await employeeRepository.findById(companyId, employeeId);
    if (!employee) {
      throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador no encontrado.");
    }

    const eligible = await isEmployeeRecordOperationalChargeHolder(companyId, employee);
    const link = await companyUserEmployeeLinkRepository.findByEmployeeId(companyId, employeeId);

    let linkPayload: EmployeeOperationalAccessStatus["link"] = null;
    if (link) {
      const user = await userRepository.findById(link.userId);
      const membership = await userCompanyMembershipRepository.findMembership(link.userId, companyId);
      if (user && membership) {
        linkPayload = {
          userId: link.userId,
          userName: user.name,
          userEmail: user.email,
          membershipStatus: membership.status,
          companyRole: membership.role,
        };
      }
    }

    const pool = getPool();
    const pending = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT id, email_normalized, status, expires_at
        FROM user_invitations
        WHERE company_id = @companyId
          AND linked_employee_id = @employeeId
          AND status = N'PENDING'
        ORDER BY created_at DESC
      `);

    const pendingInvitations = pending.recordset.map((row) => ({
      id: String(row.id),
      email: String(row.email_normalized),
      status: String(row.status),
      expiresAt: new Date(row.expires_at as Date).toISOString(),
    }));

    return { eligible, link: linkPayload, pendingInvitations };
  },

  async linkExistingUser(
    companyId: string,
    actorUserId: string | null,
    employeeId: string,
    targetUserId: string,
    actorRole: CompanyRole | undefined,
    actorIsPlatformAdmin: boolean,
  ): Promise<EmployeeOperationalAccessStatus> {
    await assertEmployeeEligible(companyId, employeeId);

    const targetUser = await userRepository.findById(targetUserId);
    if (!targetUser) {
      throw new AppError(404, "USER_NOT_FOUND", "Usuario no encontrado.");
    }

  const membership = await userCompanyMembershipRepository.findMembership(targetUserId, companyId);
  const needsRoleWrite =
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.role !== "OPERATIONAL_MANAGER";
  if (needsRoleWrite && !canAssignCompanyRole(actorRole, "OPERATIONAL_MANAGER", actorIsPlatformAdmin)) {
    throw new AppError(403, "FORBIDDEN", "No tiene permisos para asignar el rol de encargado operativo.");
  }

  await operationalManagerActivationService.linkExistingUser(
    companyId,
    actorUserId,
    targetUserId,
    employeeId,
  );

  return this.getStatus(companyId, employeeId);
  },

  async inviteUser(
    companyId: string,
    actorUserId: string | null,
    employeeId: string,
    input: { email: string; inviteeName?: string | null },
    actorRole: CompanyRole | undefined,
    actorIsPlatformAdmin: boolean,
  ) {
    await assertEmployeeEligible(companyId, employeeId);

    if (!canAssignCompanyRole(actorRole, "OPERATIONAL_MANAGER", actorIsPlatformAdmin)) {
      throw new AppError(403, "FORBIDDEN", "No tiene permisos para invitar encargados operativos.");
    }

    const result = await userInvitationService.issueOperationalManagerInvitation({
      companyId,
      email: input.email,
      inviteeName: input.inviteeName ?? null,
      invitedByUserId: actorUserId,
      linkedEmployeeId: employeeId,
    });

    return {
      invitation: result.invitation,
      emailSent: result.emailSent,
      message: result.message,
    };
  },

  async revokeAccess(
    companyId: string,
    actorUserId: string | null,
    employeeId: string,
  ): Promise<EmployeeOperationalAccessStatus> {
    const link = await companyUserEmployeeLinkRepository.findByEmployeeId(companyId, employeeId);
    if (!link) {
      throw new AppError(404, "USER_EMPLOYEE_LINK_NOT_FOUND", "No hay acceso operativo vinculado.");
    }

    await operationalManagerActivationService.revokeOperationalAccess(companyId, actorUserId, {
      userId: link.userId,
      employeeId,
    });

    return this.getStatus(companyId, employeeId);
  },
};
